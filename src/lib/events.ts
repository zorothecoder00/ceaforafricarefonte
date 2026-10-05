/* Événements (CDC §7.3) : billets valides, créneaux de rencontres B2B. */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { eventTicket } from '../db/schema/app';
import { findEvent, type EventFull } from './catalog';

/** Événement par identifiant (CMS ou code), y compris hors ligne : billets, rencontres et espace participant restent accessibles. */
export const eventById = (id: string) => findEvent(id, { hidden: true });

/** Le membre détient-il un billet valide (ou déjà scanné) pour cet événement ? */
export async function hasTicket(userId: string, eventId: string) {
  const [t] = await db.select({ id: eventTicket.id }).from(eventTicket).where(and(eq(eventTicket.userId, userId), eq(eventTicket.eventId, eventId), inArray(eventTicket.status, ['valide', 'utilise']))).limit(1);
  return !!t;
}

/** Créneaux de 20 minutes pendant les sessions de rencontres B2B du programme (2 heures par session). */
export function b2bSlots(e: EventFull): { key: string; label: string }[] {
  const x = e.extra;
  if (!x) return [];
  return x.sessions.filter((s) => /B2B/i.test(s.title)).flatMap((s) => {
    const [h, m] = s.time.split(':').map(Number);
    return Array.from({ length: 6 }, (_, i) => {
      const t = h * 60 + m + i * 20;
      const hh = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      return { key: `${s.day}-${hh}`, label: `Jour ${s.day} · ${hh}` };
    });
  });
}

export const sessionKey = (day: number, time: string) => `${day}-${time}`;
export const isPast = (date: string) => new Date(`${date}T23:59:59`) < new Date();
