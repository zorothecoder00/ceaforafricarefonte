/* Apprentissage en cohorte (CDC §7.6) : promotions d'un cours de l'Académie avec sessions en direct, devoirs et évaluation
   par les pairs. Chaque membre qui a rendu un devoir évalue `reviewsRequired` travaux d'autres membres (attribués en priorité
   aux travaux les moins évalués, jamais le sien, jamais deux fois le même). L'équipe crée les cohortes (droit C sur
   « programmes » ou « contenus »). */
import { and, asc, eq, ne, notInArray, sql } from 'drizzle-orm';
import { db } from './db';
import { academyCohort, academyCohortMember, academyAssignment, academySubmission, academyReview } from '../db/schema/app';
import { can } from './rbac';

export const canManageCohorts = (roles: readonly string[]) => can([...roles], 'programmes', 'C') || can([...roles], 'contenus', 'C');
export const sessionVisio = (s: { id: string; link: string | null }) => s.link || `https://meet.jit.si/CEA-cohorte-${s.id.slice(0, 8)}`;
/** Saisie « AAAA-MM-JJTHH:MM » d'un formulaire : heure de Lomé (GMT). */
export const gmt = (local: string) => new Date(`${local.length === 16 ? `${local}:00` : local}Z`);

export async function isMember(cohortId: string, userId: string) {
  const [m] = await db.select().from(academyCohortMember).where(and(eq(academyCohortMember.cohortId, cohortId), eq(academyCohortMember.userId, userId)));
  return !!m;
}

export async function seatsLeft(c: { id: string; seats: number | null }) {
  if (c.seats == null) return null;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(academyCohortMember).where(eq(academyCohortMember.cohortId, c.id));
  return Math.max(0, c.seats - n);
}

export async function assignmentContext(assignmentId: string) {
  const [r] = await db.select({ a: academyAssignment, c: academyCohort }).from(academyAssignment).innerJoin(academyCohort, eq(academyCohort.id, academyAssignment.cohortId)).where(eq(academyAssignment.id, assignmentId));
  return r ?? null;
}

/** Attribue à `userId` un travail à évaluer pour ce devoir ; renvoie l'évaluation en attente existante ou nouvelle, ou un motif. */
export async function assignPeerReview(userId: string, assignmentId: string): Promise<{ reviewId: string } | { error: string }> {
  const ctx = await assignmentContext(assignmentId);
  if (!ctx || !(await isMember(ctx.c.id, userId))) return { error: 'Réservé aux membres de la cohorte.' };
  const [mine] = await db.select({ id: academySubmission.id }).from(academySubmission).where(and(eq(academySubmission.assignmentId, assignmentId), eq(academySubmission.userId, userId)));
  if (!mine) return { error: 'Rendez d’abord votre propre travail : l’évaluation par les pairs vient ensuite.' };
  const given = await db.select({ r: academyReview, sub: academySubmission.assignmentId }).from(academyReview).innerJoin(academySubmission, eq(academySubmission.id, academyReview.submissionId))
    .where(and(eq(academyReview.reviewerId, userId), eq(academySubmission.assignmentId, assignmentId)));
  const pending = given.find((g) => !g.r.doneAt);
  if (pending) return { reviewId: pending.r.id };
  if (given.length >= ctx.a.reviewsRequired) return { error: 'Vous avez rendu toutes vos évaluations pour ce devoir. Merci !' };
  const already = given.map((g) => g.r.submissionId);
  const [pick] = await db.select({ id: academySubmission.id, n: sql<number>`(select count(*) from academy_review r where r.submission_id = ${academySubmission.id})::int` }).from(academySubmission)
    .where(and(eq(academySubmission.assignmentId, assignmentId), ne(academySubmission.userId, userId), ...(already.length ? [notInArray(academySubmission.id, already)] : [])))
    .orderBy(asc(sql`2`), asc(academySubmission.submittedAt)).limit(1);
  if (!pick) return { error: 'Aucun autre travail à évaluer pour le moment : revenez quand d’autres membres auront rendu le leur.' };
  const [r] = await db.insert(academyReview).values({ submissionId: pick.id, reviewerId: userId }).onConflictDoNothing().returning({ id: academyReview.id });
  return r ? { reviewId: r.id } : { error: 'Réessayez dans un instant.' };
}
