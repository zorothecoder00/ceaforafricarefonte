/* Mises à jour aux investisseurs (CDC §8.3, type Visible.vc) : envoyées aux investisseurs ayant signé un NDA ou manifesté leur intérêt. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, nda, interest, dossierEvent } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { notify } from '../../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), body: z.string().trim().min(10).max(4000) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Écrivez votre mise à jour (10 caractères minimum).');
  const [d] = await db.select().from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || d.ownerId !== u.id) return fail('Accès refusé.', 403);
  if (!d.shareConsent) return fail('Activez d’abord le partage avec les investisseurs.');
  const a = await db.select({ id: nda.investorId }).from(nda).where(and(eq(nda.dossierId, d.id), isNull(nda.revokedAt)));
  const b = await db.select({ id: interest.investorId }).from(interest).where(eq(interest.dossierId, d.id));
  const to = [...new Set([...a, ...b].map((x) => x.id))];
  for (const id of to) await notify(id, `Mise à jour de ${d.companyName} : ${p.data.body.slice(0, 160)}${p.data.body.length > 160 ? '…' : ''}`, `/kapital/opportunites/${d.id}`, { email: true });
  await db.insert(dossierEvent).values({ dossierId: d.id, toStatus: d.status, fromStatus: d.status, actorId: u.id, note: `Mise à jour aux investisseurs : ${p.data.body.slice(0, 500)}` });
  await audit(u.id, 'kapital.mise_a_jour', d.reference, { destinataires: to.length });
  return json({ ok: true, message: `Mise à jour envoyée à ${to.length} investisseur${to.length > 1 ? 's' : ''}.` });
};
