/* CEA OS — délégation de signature (Mon poste › Ma délégation de signature ; WFL-09 : début, fin, périmètre, autorisation).
   POST { action: 'create', to, start? (AAAA-MM-JJ, aujourd'hui par défaut), until (AAAA-MM-JJ), scope? (types de dossiers, vide = tous) }
        { action: 'revoke', id }
   La délégation est autorisée par son auteur (le délégant) et notifiée à son responsable hiérarchique ; elle expire seule. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDelegation } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { staffById } from '../../../../lib/os/core';
import { notifyStaff, wfConfig } from '../../../../lib/os/approvals';
import { dstr } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'), to: z.string().regex(/^EMP\d{3,6}$/), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date de fin.'),
    scope: z.preprocess((v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []), z.array(z.string().min(2).max(30)).max(30)).optional().default([]),
  }),
  z.object({ action: z.literal('revoke'), id: z.uuid() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  if (b.action === 'revoke') {
    const [d] = await db.update(osDelegation).set({ revoked: true }).where(and(eq(osDelegation.id, b.id), eq(osDelegation.fromStaff, me.id))).returning();
    if (!d) return fail('Délégation introuvable.', 404);
    await audit(me.userId, 'os.delegation.revocation', d.toStaff);
    return json({ ok: true, message: 'Délégation révoquée.' });
  }
  const until = new Date(b.until + 'T23:59:00');
  const start = b.start ? new Date(b.start + 'T00:00:00') : new Date();
  if (until < new Date()) return fail('La date de fin doit être dans le futur.');
  if (start >= until) return fail('La date de début doit précéder la date de fin.');
  const to = await staffById(b.to);
  if (!to || !to.active || to.id === me.id) return fail('Délégataire invalide.');
  const cfg = await wfConfig();
  const bad = b.scope.filter((t) => !cfg.types.has(t));
  if (bad.length) return fail(`Type de dossier inconnu : ${bad.join(', ')}.`);
  await db.insert(osDelegation).values({ fromStaff: me.id, toStaff: to.id, start, until, scope: b.scope, authorizedBy: me.id });
  const sur = b.scope.length ? ` pour : ${b.scope.map((t) => cfg.types.get(t)!.label).join(', ')}` : '';
  await notifyStaff([to.id], `Délégation reçue de ${me.name} du ${dstr(start)} au ${dstr(until)}${sur}`, '/os/approbations');
  if (me.managerId) await notifyStaff([me.managerId], `${me.name} a délégué ses approbations à ${to.name} du ${dstr(start)} au ${dstr(until)}${sur}`, '/os/organisation?t=hist');
  await audit(me.userId, 'os.delegation.creation', to.id, { debut: start.toISOString().slice(0, 10), jusqua: b.until, perimetre: b.scope.join(',') || 'tous' });
  return json({ ok: true, message: 'Délégation active.' });
};
