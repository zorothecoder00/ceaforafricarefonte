/* Rappels de rendez-vous (CDC §10 « rappels ») : tâche planifiée quotidienne (Vercel Cron, voir vercel.json).
   Envoie un rappel unique pour chaque rendez-vous d'équipe et chaque séance de mentorat confirmée des 36 prochaines heures :
   avec un passage par jour, chaque rendez-vous est rappelé une fois, entre 12 et 36 heures avant.
   Les rappels de dernière minute sont portés par les alarmes du fichier agenda (.ics).
   Appel protégé par CRON_SECRET (en-tête Authorization: Bearer …, ajouté automatiquement par Vercel). */
import type { APIRoute } from 'astro';
import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../../lib/db';
import { appointment, mentoringSession } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { sendEmail } from '../../../lib/messaging';
import { notify } from '../../../lib/notify';
import { env } from '../../../lib/env';
import { json, fail } from '../../../lib/session';
import { agendaKey, siteUrl } from '../../../lib/agenda';

export const prerender = false;

const authorized = (h: string | null) => {
  const secret = env('CRON_SECRET');
  if (!secret || !h) return false;
  const want = Buffer.from(`Bearer ${secret}`), got = Buffer.from(h);
  return want.length === got.length && timingSafeEqual(want, got);
};
const lome = (d: Date) => d.toLocaleString('fr-FR', { timeZone: 'Africa/Lome', dateStyle: 'full', timeStyle: 'short' });

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'))) return fail('Accès refusé.', 401);
  const now = new Date(), until = new Date(now.getTime() + 36 * 3600_000);
  let sent = 0, failed = 0;

  // Rendez-vous avec une équipe CEA (souvent pris sans compte : rappel par e-mail)
  const rdvs = await db.select().from(appointment).where(and(isNull(appointment.cancelledAt), isNull(appointment.remindedAt), gt(appointment.at, now), lte(appointment.at, until)));
  for (const a of rdvs) {
    try {
      await sendEmail(a.contact, `Rappel : rendez-vous CEA le ${lome(a.at)}`, `Bonjour ${a.name},\n\nPetit rappel : votre rendez-vous avec ${a.team} a lieu le ${lome(a.at)} (heure de Lomé, GMT).\nLien de visio : ${a.visio}\nRéférence : ${a.reference}\nAjouter à votre agenda : ${siteUrl()}/api/agenda.ics?rdv=${a.reference}&k=${agendaKey(a.reference)}\n\nEmpêché ? Répondez à ce message en indiquant la référence.\n\nCEA FOR AFRICA`);
      await db.update(appointment).set({ remindedAt: now }).where(eq(appointment.id, a.id));
      sent++;
    } catch (e) {
      failed++;
      console.error('[rappels] rendez-vous', a.reference, e instanceof Error ? e.message : e);
    }
  }

  // Séances de mentorat confirmées : rappel aux deux participants, selon leurs préférences de notification
  const mentor = alias(user, 'mentor'), mentee = alias(user, 'mentee');
  const seances = await db.select({ s: mentoringSession, mentor: mentor.name, mentee: mentee.name }).from(mentoringSession)
    .innerJoin(mentor, eq(mentor.id, mentoringSession.mentorId)).innerJoin(mentee, eq(mentee.id, mentoringSession.menteeId))
    .where(and(eq(mentoringSession.status, 'confirmee'), isNull(mentoringSession.remindedAt), gt(mentoringSession.startsAt, now), lte(mentoringSession.startsAt, until)));
  for (const { s, mentor: mName, mentee: eName } of seances) {
    try {
      const when = lome(s.startsAt);
      await notify(s.menteeId, `Rappel : séance avec ${mName} le ${when} (heure de Lomé)`, '/espace/mentorat', { email: true, whatsapp: true });
      await notify(s.mentorId, `Rappel : séance avec ${eName} le ${when} (heure de Lomé)`, '/espace/mentor', { email: true, whatsapp: true });
      await db.update(mentoringSession).set({ remindedAt: now }).where(eq(mentoringSession.id, s.id));
      sent++;
    } catch (e) {
      failed++;
      console.error('[rappels] mentorat', s.id, e instanceof Error ? e.message : e);
    }
  }

  return json({ ok: true, sent, failed });
};
