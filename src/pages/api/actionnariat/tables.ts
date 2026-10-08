/* Studio de capital (CDC §7.5) : tables de capitalisation d'un membre.
   POST   { company }            → crée une table vide ; renvoie son adresse
   PUT    { id, company, model } → enregistre (modèle validé par src/lib/captable.ts)
   DELETE { id }                 → supprime */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { capTable } from '../../../db/schema/app';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { Model, emptyModel } from '../../../lib/captable';

export const prerender = false;
const company = z.string().trim().min(2).max(120);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ company }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Indiquez le nom de l’entreprise.');
  const [{ n }] = await db.select({ n: count() }).from(capTable).where(eq(capTable.ownerId, u.id));
  if (n >= 10) return fail('10 tables au plus par compte.');
  const [t] = await db.insert(capTable).values({ ownerId: u.id, company: p.data.company, model: emptyModel() }).returning({ id: capTable.id });
  await audit(u.id, 'studio.table.creation', t.id);
  return json({ ok: true, message: 'Table créée.', redirect: `/actionnariat/studio/${t.id}` });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid(), company, model: Model }).safeParse(await request.json().catch(() => null));
  if (!p.success) { const i = p.error.issues[0]; return fail(i ? `${i.message} (${i.path.join(' › ')})` : 'Données invalides.'); }
  const [t] = await db.update(capTable).set({ company: p.data.company, model: p.data.model, updatedAt: new Date() }).where(and(eq(capTable.id, p.data.id), eq(capTable.ownerId, u.id))).returning({ id: capTable.id });
  if (!t) return fail('Table introuvable.', 404);
  return json({ ok: true, message: 'Table enregistrée.' });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Table inconnue.');
  const [t] = await db.delete(capTable).where(and(eq(capTable.id, p.data.id), eq(capTable.ownerId, u.id))).returning({ id: capTable.id });
  if (!t) return fail('Table introuvable.', 404);
  await audit(u.id, 'studio.table.suppression', t.id);
  return json({ ok: true, message: 'Table supprimée.', redirect: '/actionnariat/studio' });
};
