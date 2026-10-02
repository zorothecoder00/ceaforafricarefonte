/* Événements (CDC §7.3).
   POST { action:'agenda', eventId, session, add }         → programme personnel
   POST { action:'b2b.profil', eventId, offer, need }      → participer aux rencontres B2B (billet requis)
   POST { action:'b2b.demande', eventId, targetId, slot, note? } · { action:'b2b.reponse', meetingId, accept }
   POST { action:'avis', eventId, rating, nps?, comment? } → après l'événement (billet requis) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../lib/db';
import { eventAgenda, b2bProfile, b2bMeeting, eventFeedback } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { notify } from '../../lib/notify';
import { eventById, hasTicket, b2bSlots, isPast } from '../../lib/events';
import { EXTRA } from '../../data/events-extra';

export const prerender = false;

const ev = z.string().refine((id) => !!eventById(id), 'Événement inconnu');
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('agenda'), eventId: ev, session: z.string().regex(/^\d-\d{2}:\d{2}$/), add: z.boolean().default(true) }),
  z.object({ action: z.literal('b2b.profil'), eventId: ev, offer: z.string().trim().min(5).max(300), need: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal('b2b.demande'), eventId: ev, targetId: z.string().min(1).max(64), slot: z.string().max(10), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('b2b.reponse'), meetingId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('avis'), eventId: ev, rating: z.coerce.number().int().min(1).max(5), nps: z.coerce.number().int().min(0).max(10).nullish(), comment: z.string().max(2000).optional() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez les champs du formulaire.');
  const b = p.data;
  switch (b.action) {
    case 'agenda': {
      if (!EXTRA[b.eventId]?.sessions.some((s) => `${s.day}-${s.time}` === b.session)) return fail('Session inconnue.');
      if (b.add) await db.insert(eventAgenda).values({ userId: u.id, eventId: b.eventId, session: b.session }).onConflictDoNothing();
      else await db.delete(eventAgenda).where(and(eq(eventAgenda.userId, u.id), eq(eventAgenda.eventId, b.eventId), eq(eventAgenda.session, b.session)));
      return json({ ok: true, message: b.add ? 'Ajoutée à mon programme.' : 'Retirée de mon programme.' });
    }
    case 'b2b.profil':
      if (!(await hasTicket(u.id, b.eventId))) return fail('Les rencontres B2B sont réservées aux détenteurs d’un billet.', 403);
      await db.insert(b2bProfile).values({ eventId: b.eventId, userId: u.id, offer: b.offer, need: b.need }).onConflictDoUpdate({ target: [b2bProfile.eventId, b2bProfile.userId], set: { offer: b.offer, need: b.need } });
      return json({ ok: true, message: 'Profil B2B enregistré : les autres participants peuvent vous proposer un rendez-vous.' });
    case 'b2b.demande': {
      if (b.targetId === u.id) return fail('Choisissez un autre participant.');
      if (!b2bSlots(b.eventId).some((s) => s.key === b.slot)) return fail('Créneau invalide.');
      const [mine] = await db.select().from(b2bProfile).where(and(eq(b2bProfile.eventId, b.eventId), eq(b2bProfile.userId, u.id)));
      const [target] = await db.select().from(b2bProfile).where(and(eq(b2bProfile.eventId, b.eventId), eq(b2bProfile.userId, b.targetId)));
      if (!mine) return fail('Créez d’abord votre profil B2B.');
      if (!target) return fail('Ce participant ne prend pas de rendez-vous.');
      // Un créneau ne peut être occupé deux fois par la même personne
      const busy = await db.select({ id: b2bMeeting.id }).from(b2bMeeting).where(and(eq(b2bMeeting.eventId, b.eventId), eq(b2bMeeting.slot, b.slot), inArray(b2bMeeting.status, ['demandee', 'acceptee']),
        or(inArray(b2bMeeting.requesterId, [u.id, b.targetId]), inArray(b2bMeeting.targetId, [u.id, b.targetId]))));
      if (busy.length) return fail('Ce créneau est déjà pris pour l’un de vous deux.');
      await db.insert(b2bMeeting).values({ eventId: b.eventId, requesterId: u.id, targetId: b.targetId, slot: b.slot, note: b.note });
      await notify(b.targetId, `${u.name} vous propose un rendez-vous B2B (${b.slot.replace('-', ' · ')})`, `/evenements/${b.eventId}/participant?onglet=b2b`, { email: true });
      return json({ ok: true, message: 'Demande envoyée.' });
    }
    case 'b2b.reponse': {
      const [m] = await db.select().from(b2bMeeting).where(eq(b2bMeeting.id, b.meetingId));
      if (!m || m.targetId !== u.id || m.status !== 'demandee') return fail('Demande introuvable.', 404);
      await db.update(b2bMeeting).set({ status: b.accept ? 'acceptee' : 'refusee' }).where(eq(b2bMeeting.id, m.id));
      await notify(m.requesterId, `${u.name} a ${b.accept ? 'accepté' : 'décliné'} votre rendez-vous B2B (${m.slot.replace('-', ' · ')})`, `/evenements/${m.eventId}/participant?onglet=b2b`);
      return json({ ok: true, message: b.accept ? 'Rendez-vous confirmé.' : 'Demande déclinée.' });
    }
    case 'avis': {
      const e = eventById(b.eventId)!;
      if (!isPast(e.date)) return fail('L’avis s’ouvre après l’événement.');
      if (!(await hasTicket(u.id, b.eventId))) return fail('Réservé aux participants.', 403);
      await db.insert(eventFeedback).values({ eventId: b.eventId, userId: u.id, rating: b.rating, nps: b.nps ?? null, comment: b.comment }).onConflictDoUpdate({ target: [eventFeedback.eventId, eventFeedback.userId], set: { rating: b.rating, nps: b.nps ?? null, comment: b.comment, at: new Date() } });
      return json({ ok: true, message: 'Merci pour votre avis !' });
    }
  }
};
