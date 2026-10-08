/* Accord de confidentialité électronique (CDC §8.9) : ouvre l'accès à la data room d'un dossier pour une durée limitée
   (dossier.accessDays, 90 jours par défaut). Révocable et prolongeable par l'entreprise. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
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
  const expiresAt = new Date(Date.now() + d.accessDays * 864e5);
  await db.insert(nda).values({ dossierId: d.id, investorId: u.id, signatureRef: `NDA-${Date.now()}-${clientIp(request) ?? ''}`, expiresAt })
    .onConflictDoUpdate({ target: [nda.dossierId, nda.investorId], set: { revokedAt: null, signedAt: new Date(), expiresAt, expiryNoticeAt: null } });
  await audit(u.id, 'kapital.nda.signature', d.reference, { jours: d.accessDays }, clientIp(request));
  await notify(d.ownerId, `Un investisseur vérifié a signé l'accord de confidentialité pour ${d.companyName}.`, '/kapital/entreprise');
  return json({ ok: true, message: `Accord signé : la data room est ouverte pour ${d.accessDays} jours.`, redirect: `/kapital/opportunites/${d.id}` });
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

/* Réglages de l'entreprise (PATCH) :
   { dossierId, investorId, days } → prolonge l'accès d'un investisseur de `days` jours (à partir d'aujourd'hui s'il a expiré) ;
   { dossierId, accessDays }      → durée d'accès accordée aux prochaines signatures. */
const Patch = z.union([
  z.object({ dossierId: z.uuid(), investorId: z.string().min(1), days: z.number().int().min(7).max(365) }),
  z.object({ dossierId: z.uuid(), accessDays: z.number().int().min(7).max(365) }),
]);
export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Patch.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Durée invalide : entre 7 et 365 jours.');
  const [d] = await db.select({ id: dossier.id, owner: dossier.ownerId, ref: dossier.reference, company: dossier.companyName }).from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || d.owner !== u.id) return fail('Accès refusé.', 403);
  if ('accessDays' in p.data) {
    await db.update(dossier).set({ accessDays: p.data.accessDays, updatedAt: new Date() }).where(eq(dossier.id, d.id));
    await audit(u.id, 'kapital.nda.duree', d.ref, { jours: p.data.accessDays });
    return json({ ok: true, message: `Les prochains accès dureront ${p.data.accessDays} jours.` });
  }
  const [n] = await db.select().from(nda).where(and(eq(nda.dossierId, d.id), eq(nda.investorId, p.data.investorId), isNull(nda.revokedAt)));
  if (!n) return fail('Accord introuvable ou révoqué.', 404);
  const from = Math.max(Date.now(), n.expiresAt?.getTime() ?? Date.now());
  const expiresAt = new Date(from + p.data.days * 864e5);
  await db.update(nda).set({ expiresAt, expiryNoticeAt: null }).where(eq(nda.id, n.id));
  await audit(u.id, 'kapital.nda.prolongation', d.ref, { investor: p.data.investorId, jours: p.data.days });
  await notify(p.data.investorId, `Votre accès à la data room de ${d.company} est prolongé jusqu'au ${expiresAt.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.`, `/kapital/opportunites/${d.id}`);
  return json({ ok: true, message: `Accès prolongé jusqu'au ${expiresAt.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.` });
};
