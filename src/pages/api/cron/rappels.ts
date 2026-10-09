/* Rappels de rendez-vous (CDC §10 « rappels ») : tâche planifiée quotidienne (Vercel Cron, voir vercel.json).
   Au même passage : relances des tickets, fermeture des offres d'emploi expirées et questionnaires de suivi des anciens, durées de conservation des données.
   Envoie un rappel unique pour chaque rendez-vous d'équipe et chaque séance de mentorat confirmée des 36 prochaines heures :
   avec un passage par jour, chaque rendez-vous est rappelé une fois, entre 12 et 36 heures avant.
   Les rappels de dernière minute sont portés par les alarmes du fichier agenda (.ics).
   Appel protégé par CRON_SECRET (en-tête Authorization: Bearer …, ajouté automatiquement par Vercel). */
import type { APIRoute } from 'astro';
import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../../lib/db';
import { appointment, mentoringSession } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { sendEmail } from '../../../lib/messaging';
import { notify } from '../../../lib/notify';
import { json, fail } from '../../../lib/session';
import { cronAuthorized } from '../../../lib/cron';
import { runEscalations } from '../../../lib/escalations';
import { closeExpiredJobs } from '../../../lib/jobs';
import { sendFollowupRequests } from '../../../lib/followups';
import { runRetention } from '../../../lib/retention';
import { closePreviousMonth } from '../../../lib/vp-contest';
import { noticeExpiringAccess } from '../../../lib/kapital';
import { sendForecastAlerts } from '../../../lib/event-forecast';
import { remindStreaks } from '../../../lib/streaks';
import { qualifyReferrals } from '../../../lib/referrals';
import { syncPoints } from '../../../lib/points';
import { matchWeek } from '../../../lib/coffee';
import { slaSweep } from '../../../lib/os/approvals';
import { agendaKey, siteUrl } from '../../../lib/agenda';

export const prerender = false;

const lome = (d: Date) => d.toLocaleString('fr-FR', { timeZone: 'Africa/Lome', dateStyle: 'full', timeStyle: 'short' });

export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request.headers.get('authorization'))) return fail('Accès refusé.', 401);
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

  // Workflows (CDC §12) : relances et escalades des tickets, au même passage quotidien
  const tickets = await runEscalations(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  // Offres d'emploi arrivées à expiration : fermées, recruteurs prévenus (elles sont déjà masquées du public dès l'échéance)
  const expiredJobs = await closeExpiredJobs(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Questionnaires de suivi des anciens à 3, 6 et 12 mois après la fin de leur cohorte (une relance au bout de 14 jours)
  const followups = await sendFollowupRequests(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Durées de conservation de la politique de confidentialité : suppression ou anonymisation automatique (CDC §15.1)
  const retention = await runRetention(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Kapital : classement du concours de portefeuille virtuel figé au début du mois ; préavis d'expiration des accès aux data rooms
  const concours = await closePreviousMonth(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const dataroom = await noticeExpiringAccess(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Événements : alertes de complet prévu ou de surréservation (une fois par événement et par alerte)
  const frequentation = await sendForecastAlerts(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Académie : rappel aux membres dont la série de jours d'apprentissage s'arrête ce soir
  const series = await remindStreaks(now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Communauté : filleuls devenus actifs, points de contribution, binômes du café virtuel (le lundi)
  const err = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });
  const filleuls = await qualifyReferrals().catch(err);
  const points = await syncPoints().catch(err);
  const cafe = await matchWeek(now).catch(err);
  // CEA OS : délais de validation (rappel, escalade au responsable puis à la Direction générale, suspension pendant un congé)
  const validations = await slaSweep(now).catch(err);
  return json({ ok: true, sent, failed, tickets, expiredJobs, followups, retention, concours, dataroom, frequentation, series, filleuls, points, cafe, validations });
};
