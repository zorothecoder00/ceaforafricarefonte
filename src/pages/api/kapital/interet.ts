/* Manifestation d'intérêt (non engageante) pour un dossier — investisseurs vérifiés uniquement (CDC §8.5 : avant agrément, aucun paiement ni souscription). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, interest } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { isVerifiedInvestor } from '../../../lib/kapital';
import { notify } from '../../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), amountXof: z.coerce.number().int().min(0).max(1e13).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  if (!(await isVerifiedInvestor(u.id))) return json({ ok: false, error: 'Réservé aux investisseurs vérifiés.', redirect: '/kapital/devenir-investisseur' }, 403);
  const [d] = await db.select({ id: dossier.id, ref: dossier.reference, owner: dossier.ownerId, analyst: dossier.analystId, published: dossier.published }).from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || !d.published) return fail('Opportunité introuvable.', 404);
  await db.insert(interest).values({ dossierId: d.id, investorId: u.id, amountXof: p.data.amountXof }).onConflictDoUpdate({ target: [interest.dossierId, interest.investorId], set: { amountXof: p.data.amountXof } });
  await audit(u.id, 'kapital.interet', d.ref, { amount: p.data.amountXof });
  if (d.analyst) await notify(d.analyst, `Nouvel intérêt d'investisseur sur le dossier ${d.ref}`, '/admin/kapital');
  return json({ ok: true, message: 'Intérêt enregistré (non engageant). L’analyste en charge vous recontacte.' });
};
