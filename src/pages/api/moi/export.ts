/* Export des données personnelles (CDC §9.1, §15.1) : fichier JSON téléchargeable. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import * as s from '../../../db/schema';
import { requireUser, audit, clientIp } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const id = u.id;
  const [account] = await db.select({ id: s.user.id, name: s.user.name, email: s.user.email, phoneNumber: s.user.phoneNumber, createdAt: s.user.createdAt }).from(s.user).where(eq(s.user.id, id));
  const data = {
    exporte_le: new Date().toISOString(),
    compte: account,
    roles: await db.select().from(s.userRole).where(eq(s.userRole.userId, id)),
    profil: (await db.select().from(s.profile).where(eq(s.profile.userId, id)))[0] ?? null,
    consentements: await db.select().from(s.consent).where(eq(s.consent.userId, id)),
    adhesions: await db.select().from(s.membership).where(eq(s.membership.userId, id)),
    paiements: await db.select().from(s.payment).where(eq(s.payment.userId, id)),
    cours: await db.select().from(s.enrollment).where(eq(s.enrollment.userId, id)),
    certificats: await db.select().from(s.certificate).where(eq(s.certificate.userId, id)),
    candidatures_programmes: await db.select().from(s.programmeApplication).where(eq(s.programmeApplication.userId, id)),
    candidatures_emplois: await db.select().from(s.jobApplication).where(eq(s.jobApplication.userId, id)),
    billets: await db.select().from(s.eventTicket).where(eq(s.eventTicket.userId, id)),
    votes: await db.select().from(s.consultationVote).where(eq(s.consultationVote.userId, id)),
    publications: await db.select().from(s.post).where(eq(s.post.authorId, id)),
    messages_envoyes: await db.select().from(s.message).where(eq(s.message.senderId, id)),
    notifications: await db.select().from(s.notification).where(eq(s.notification.userId, id)),
    kapital: {
      dossiers: await db.select().from(s.dossier).where(eq(s.dossier.ownerId, id)),
      profil_investisseur: (await db.select().from(s.investorProfile).where(eq(s.investorProfile.userId, id)))[0] ?? null,
      diagnostics: await db.select().from(s.diagnostic).where(eq(s.diagnostic.userId, id)),
    },
  };
  await audit(id, 'donnees.export', id, {}, clientIp(request));
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="cea-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' },
  });
};
