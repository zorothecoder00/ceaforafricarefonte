/* Contacts collectés par les sponsors sur leur stand (CDC §7.3). Les coordonnées d'un participant ne sont jamais copiées :
   elles sont lues sur son billet au moment de l'affichage, et seulement tant que son accord (sponsorConsent) est donné.
   Retirer son accord les masque donc immédiatement chez tous les sponsors. */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import { eventLead, eventSponsorAccess, eventTicket } from '../db/schema/app';
import { user } from '../db/schema/auth';

export async function activeAccess(userId: string, eventId: string) {
  const [a] = await db.select().from(eventSponsorAccess).where(and(eq(eventSponsorAccess.userId, userId), eq(eventSponsorAccess.eventId, eventId), isNull(eventSponsorAccess.revokedAt)));
  return a ?? null;
}

/** Code lu sur un badge ou un billet : adresse de vérification (…/verifier/billet/CODE) ou code seul. */
export const ticketCode = (raw: string) => decodeURIComponent(raw.trim()).toUpperCase().replace(/^.*\/VERIFIER\/BILLET\//, '');

export type LeadRow = { id: string; at: Date; note: string | null; consent: boolean; name: string | null; email: string | null; type: string };
export async function leadsOf(accessId: string): Promise<LeadRow[]> {
  const rows = await db.select({ l: eventLead, t: eventTicket, uname: user.name, uemail: user.email }).from(eventLead)
    .innerJoin(eventTicket, eq(eventTicket.id, eventLead.ticketId)).leftJoin(user, eq(user.id, eventTicket.userId))
    .where(eq(eventLead.accessId, accessId)).orderBy(desc(eventLead.createdAt));
  return rows.map(({ l, t, uname, uemail }) => ({
    id: l.id, at: l.createdAt, note: l.note, consent: t.sponsorConsent, type: t.ticketType,
    name: t.sponsorConsent ? (t.holderName ?? uname) : null,
    email: t.sponsorConsent ? (t.holderEmail ?? uemail) : null,
  }));
}

/** Sponsors qui ont scanné les badges d'un participant (transparence, page « Mes billets »). */
export async function sponsorsWhoScanned(ticketIds: string[]) {
  if (!ticketIds.length) return [];
  const rows = await db.select({ ticketId: eventLead.ticketId, sponsor: eventSponsorAccess.sponsorName, at: eventLead.createdAt }).from(eventLead)
    .innerJoin(eventSponsorAccess, eq(eventSponsorAccess.id, eventLead.accessId)).where(inArray(eventLead.ticketId, ticketIds)).orderBy(desc(eventLead.createdAt));
  return rows;
}
