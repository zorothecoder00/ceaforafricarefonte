/* Formulaires sans code (CDC §12) — administration. Droits : objet « formulaires » (§18) : C/M pour préparer, V pour publier ou clore.
   POST { action: 'save', id?, … } | { action: 'status', id, status } | { action: 'delete', id } (brouillon sans réponse) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { formDef, formSubmission } from '../../../db/schema/workflows';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { FormFields, Rules } from '../../../lib/forms';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'), id: z.uuid().optional(), slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Identifiant : minuscules, chiffres et tirets').max(60),
    title: z.string().trim().min(3).max(160), intro: z.string().trim().max(2000).default(''), fields: FormFields, routing: Rules,
    defaultTeam: z.string().trim().min(2).max(60), delay: z.string().trim().min(3).max(40), ack: z.string().trim().min(5).max(500), requireLogin: z.boolean(),
  }),
  z.object({ action: z.literal('status'), id: z.uuid(), status: z.enum(['brouillon', 'publie', 'clos']) }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  const b = p.data;
  const u = staffApi(locals.user, 'formulaires', b.action === 'save' ? (b.id ? 'M' : 'C') : 'V');
  if (u instanceof Response) return u;
  const ip = clientIp(request);
  switch (b.action) {
    case 'save': {
      // Une règle de routage doit porter sur un champ existant
      const bad = b.routing.find((r) => !b.fields.some((f) => f.key === r.field));
      if (bad) return fail(`Règle de routage sur un champ inconnu : ${bad.field}`);
      const [taken] = await db.select({ id: formDef.id }).from(formDef).where(and(eq(formDef.slug, b.slug), b.id ? ne(formDef.id, b.id) : undefined));
      if (taken) return fail('Cet identifiant est déjà utilisé.');
      const { action: _a, id: fid, ...v } = b;
      if (fid) {
        await db.update(formDef).set({ ...v, updatedAt: new Date() }).where(eq(formDef.id, fid));
        await audit(u.id, 'formulaire.maj', fid, {}, ip);
        return json({ ok: true, message: 'Formulaire enregistré.' });
      }
      const [n] = await db.insert(formDef).values({ ...v, createdBy: u.id }).returning({ id: formDef.id });
      await audit(u.id, 'formulaire.creation', n.id, { slug: v.slug }, ip);
      return json({ ok: true, message: 'Formulaire créé.', redirect: `/admin/formulaires/${n.id}` });
    }
    case 'status': {
      await db.update(formDef).set({ status: b.status, updatedAt: new Date() }).where(eq(formDef.id, b.id));
      await audit(u.id, `formulaire.${b.status}`, b.id, {}, ip);
      return json({ ok: true, message: b.status === 'publie' ? 'Formulaire publié.' : b.status === 'clos' ? 'Formulaire clos.' : 'Formulaire repassé en brouillon.' });
    }
    case 'delete': {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(formSubmission).where(eq(formSubmission.formId, b.id));
      if (n) return fail('Ce formulaire a reçu des réponses : closez-le plutôt (les réponses sont conservées).');
      await db.delete(formDef).where(eq(formDef.id, b.id));
      await audit(u.id, 'formulaire.suppression', b.id, {}, ip);
      return json({ ok: true, message: 'Formulaire supprimé.', redirect: '/admin/formulaires' });
    }
  }
};
