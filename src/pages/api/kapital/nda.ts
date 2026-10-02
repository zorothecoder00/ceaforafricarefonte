/* Accord de confidentialité électronique (CDC §8.9) : ouvre l'accès à la data room d'un dossier. Révocable par l'entreprise. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, nda } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { isOpen, isVerifiedInvestor } from '../../../lib/kapital';
import { notify } from '../../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), accept: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vous devez accepter les termes de l’accord.');
  if (!(await isVerifiedInvestor(u.id))) return json({ ok: false, error: 'Réservé aux investisseurs vérifiés.', redirect: '/kapital/devenir-investisseur' }, 403);
  const [d] = await db.select().from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || !d.published || !d.shareConsent) return fail('Ce dossier n’est pas partagé.', 404);
  if (!(await isOpen('kap_intro', d.country))) return fail('La mise en relation privée n’est pas encore ouverte dans ce pays (voir Conformité).', 403);
  await db.insert(nda).values({ dossierId: d.id, investorId: u.id, signatureRef: `NDA-${Date.now()}-${clientIp(request) ?? ''}` }).onConflictDoUpdate({ target: [nda.dossierId, nda.investorId], set: { revokedAt: null, signedAt: new Date() } });
  await audit(u.id, 'kapital.nda.signature', d.reference, {}, clientIp(request));
  await notify(d.ownerId, `Un investisseur vérifié a signé l'accord de confidentialité pour ${d.companyName}.`, '/kapital/entreprise');
  return json({ ok: true, message: 'Accord signé : la data room est ouverte.', redirect: `/kapital/opportunites/${d.id}` });
};

/* Révocation par l'entreprise (DELETE { dossierId, investorId }) */
export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), investorId: z.string() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [d] = await db.select({ owner: dossier.ownerId, ref: dossier.reference }).from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || d.owner !== u.id) return fail('Accès refusé.', 403);
  await db.update(nda).set({ revokedAt: new Date() }).where(and(eq(nda.dossierId, p.data.dossierId), eq(nda.investorId, p.data.investorId)));
  await audit(u.id, 'kapital.nda.revocation', d.ref, { investor: p.data.investorId });
  return json({ ok: true, message: 'Accès révoqué immédiatement.' });
};
