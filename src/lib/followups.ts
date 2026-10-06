/* Suivi long terme des anciens (CDC §7.6, §7.9) : questionnaires envoyés automatiquement à 3, 6 et 12 mois après la fin
   d'une cohorte (chiffre d'affaires, emplois, fonds levés), relancés une fois au bout de 14 jours sans réponse.
   La réponse est la déclaration « followup.declare » de Mon espace › Mon programme (table alumni_followup). */
import { and, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { db } from './db';
import { cohort, cohortMember, alumniFollowup, followupRequest } from '../db/schema/programmes';
import { notify } from './notify';

/** Points de suivi possibles (déclaration ou saisie par l'équipe). */
export const FOLLOWUP_MONTHS = [3, 6, 12, 24, 36] as const;
/** Points de suivi demandés automatiquement. */
export const AUTO_MONTHS = [3, 6, 12] as const;
/** Fenêtre d'envoi : au-delà, un point de suivi manqué n'est plus demandé (cohortes anciennes importées). */
const WINDOW_DAYS = 60;
const REMIND_AFTER_DAYS = 14;

const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const DAY = 86_400_000;

export const followupLink = (cohortId: string, months: number) => `/espace/programme?suivi=${cohortId}-${months}#suivi`;

/** Envoie les questionnaires arrivés à échéance et relance une fois ceux restés sans réponse. */
export async function sendFollowupRequests(now = new Date()) {
  const ended = await db.select({ id: cohort.id, name: cohort.name, programme: cohort.programme, endsOn: cohort.endsOn }).from(cohort)
    .where(and(isNotNull(cohort.endsOn), lte(cohort.endsOn, now.toISOString().slice(0, 10))));
  if (!ended.length) return { sent: 0, reminded: 0 };
  const ids = ended.map((c) => c.id);
  const [members, answered, requests] = await Promise.all([
    db.select({ cohortId: cohortMember.cohortId, userId: cohortMember.userId }).from(cohortMember).where(and(inArray(cohortMember.cohortId, ids), ne(cohortMember.status, 'abandon'))),
    db.select({ cohortId: alumniFollowup.cohortId, userId: alumniFollowup.userId, m: alumniFollowup.monthsAfter }).from(alumniFollowup).where(inArray(alumniFollowup.cohortId, ids)),
    db.select().from(followupRequest).where(inArray(followupRequest.cohortId, ids)),
  ]);
  const k = (c: string, u: string, m: number) => `${c}|${u}|${m}`;
  const done = new Set(answered.map((a) => k(a.cohortId, a.userId, a.m)));
  const asked = new Map(requests.map((r) => [k(r.cohortId, r.userId, r.monthsAfter), r]));
  let sent = 0, reminded = 0;
  for (const c of ended) {
    const end = new Date(`${c.endsOn}T00:00:00Z`);
    for (const m of AUTO_MONTHS) {
      const due = addMonths(end, m);
      if (now < due) continue;
      for (const mb of members.filter((x) => x.cohortId === c.id)) {
        const key = k(c.id, mb.userId, m);
        if (done.has(key)) continue;
        const req = asked.get(key);
        if (!req) {
          if (now.getTime() - due.getTime() > WINDOW_DAYS * DAY) continue;
          await db.insert(followupRequest).values({ cohortId: c.id, userId: mb.userId, monthsAfter: m, sentAt: now }).onConflictDoNothing();
          await notify(mb.userId, `${m} mois après « ${c.name} » : 2 minutes pour nous dire où en est votre entreprise (chiffre d’affaires, emplois, financement).`, followupLink(c.id, m), { email: true, whatsapp: true });
          sent++;
        } else if (!req.remindedAt && now.getTime() - req.sentAt.getTime() > REMIND_AFTER_DAYS * DAY) {
          await db.update(followupRequest).set({ remindedAt: now }).where(and(eq(followupRequest.cohortId, c.id), eq(followupRequest.userId, mb.userId), eq(followupRequest.monthsAfter, m)));
          await notify(mb.userId, `Rappel : votre questionnaire de suivi à ${m} mois (« ${c.name} ») vous attend.`, followupLink(c.id, m), { email: true });
          reminded++;
        }
      }
    }
  }
  return { sent, reminded };
}

/** Points de suivi demandés à un membre et encore sans réponse (pour les mettre en avant dans Mon programme). */
export async function pendingFollowups(userId: string, cohortIds: string[]) {
  if (!cohortIds.length) return [];
  const [reqs, answered] = await Promise.all([
    db.select().from(followupRequest).where(and(eq(followupRequest.userId, userId), inArray(followupRequest.cohortId, cohortIds))),
    db.select({ c: alumniFollowup.cohortId, m: alumniFollowup.monthsAfter }).from(alumniFollowup).where(and(eq(alumniFollowup.userId, userId), inArray(alumniFollowup.cohortId, cohortIds))),
  ]);
  return reqs.filter((r) => !answered.some((a) => a.c === r.cohortId && a.m === r.monthsAfter));
}
