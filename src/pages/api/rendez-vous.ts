/* Prise de rendez-vous en visio avec une équipe CEA (CDC §6.2).
   GET ?team=… → créneaux libres des 14 prochains jours ; POST { team, at, name, contact, topic?, consent } → réservation.
   Le lien de visio (Jitsi Meet, sans compte) est propre à chaque rendez-vous ; un message est aussi routé vers l'équipe. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { db } from '../../lib/db';
import { appointment, contactMessage } from '../../db/schema/app';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { sendEmail } from '../../lib/messaging';
import { upcomingSlots } from '../../lib/slots';
import { env } from '../../lib/env';
import { TEAM_SLOTS } from '../../data/teams';
import { agendaKey, agendaLinks, appointmentMeeting, siteUrl } from '../../lib/agenda';

export const prerender = false;


// Les créneaux sont exprimés en UTC (« 2026-10-05T10:00 » = 10 h à Lomé)
const toDate = (iso: string) => new Date(iso + ':00Z');

async function freeSlots(team: string) {
  const taken = await db.select({ at: appointment.at }).from(appointment).where(and(eq(appointment.team, team), isNull(appointment.cancelledAt), gte(appointment.at, new Date())));
  // upcomingSlots raisonne en heure locale du serveur : on lui passe des dates « décalées » pour rester en UTC
  const offset = new Date().getTimezoneOffset() * 60000;
  return upcomingSlots(TEAM_SLOTS[team], taken.map((t) => new Date(t.at.getTime() + offset)));
}

export const GET: APIRoute = async ({ url }) => {
  const team = url.searchParams.get('team') ?? '';
  if (!TEAM_SLOTS[team]) return fail('Équipe inconnue.', 404);
  return json({ ok: true, slots: await freeSlots(team) });
};

const Body = z.object({
  team: z.string().refine((t) => t in TEAM_SLOTS, 'Équipe inconnue'),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(120),
  contact: z.string().trim().pipe(z.email('Indiquez une adresse e-mail pour recevoir le lien de visio.').max(160)),
  topic: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { message: 'Consentement requis' }),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'rdv', 5);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true, message: 'Rendez-vous enregistré.' });
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Vérifiez le formulaire.');
  const b = p.data;
  if (!(await freeSlots(b.team)).some((s) => s.iso === b.at)) return fail('Ce créneau n’est plus disponible. Choisissez-en un autre.', 409);
  const ref = reference('RDV');
  const visio = `https://meet.jit.si/CEA-${ref}-${crypto.randomUUID().slice(0, 8)}`;
  const at = toDate(b.at);
  try {
    await db.insert(appointment).values({ reference: ref, team: b.team, at, name: b.name, contact: b.contact, topic: b.topic, visio, userId: locals.user?.id ?? null });
  } catch {
    return fail('Ce créneau vient d’être réservé. Choisissez-en un autre.', 409); // index unique (équipe, créneau)
  }
  const when = at.toLocaleString('fr-FR', { timeZone: 'Africa/Lome', dateStyle: 'full', timeStyle: 'short' });
  await db.insert(contactMessage).values({ reference: ref, motif: 'Rendez-vous', routedTeam: b.team, name: b.name, contact: b.contact, message: `Rendez-vous en visio le ${when} (heure de Lomé).\nLien : ${visio}${b.topic ? `\n\nSujet : ${b.topic}` : ''}`, userId: locals.user?.id ?? null });
  await audit(locals.user?.id, 'contact.rendez_vous', ref, { team: b.team, at: at.toISOString() }, clientIp(request));
  const agenda = agendaLinks(appointmentMeeting({ reference: ref, team: b.team, at, topic: b.topic ?? null, visio }), `/api/agenda.ics?rdv=${ref}&k=${agendaKey(ref)}`, siteUrl());
  await sendEmail(b.contact, `Votre rendez-vous CEA du ${when}`, `Bonjour ${b.name},\n\nVotre rendez-vous avec ${b.team} est confirmé le ${when} (heure de Lomé, GMT).\nLien de visio : ${visio}\nRéférence : ${ref}\n\nAjouter à votre agenda :\n- Google Agenda : ${agenda.google}\n- Outlook : ${agenda.outlook}\n- Autre agenda (fichier .ics) : ${agenda.ics}\nVous recevrez aussi un rappel la veille.\n\nPour annuler, répondez à ce message en indiquant la référence.\n\nCEA FOR AFRICA`).catch(() => {});
  const inbox = env('CONTACT_EMAIL');
  if (inbox) await sendEmail(inbox, `[${b.team}] Rendez-vous ${ref} — ${when}`, `${b.name} (${b.contact})\n${visio}\n\n${b.topic ?? ''}`).catch(() => {});
  return json({ ok: true, reference: ref, visio, agenda, message: `Rendez-vous ${ref} confirmé le ${when}. Le lien de visio vous a été envoyé par e-mail.` });
};
