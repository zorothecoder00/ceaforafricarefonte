/* Cohortes de l'Académie (CDC §7.6). POST { action, … }
   Membres : rejoindre { cohortId } · quitter { cohortId } · rendre { assignmentId, body, link? } · evaluer { assignmentId }
             noter { reviewId, score, comment }
   Équipe (droit C sur programmes ou contenus, double authentification) : creer { courseId, name, startsOn, endsOn, seats? }
             session { cohortId, title, startsAt, minutes, link? } · devoir { cohortId, title, instructions, dueAt, reviewsRequired }
             retirer { kind: 'session' | 'devoir', id } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { academyCohort, academyCohortMember, academySession, academyAssignment, academySubmission, academyReview, enrollment } from '../../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { needs2fa } from '../../../lib/rbac';
import { findCourse } from '../../../lib/catalog';
import { notify } from '../../../lib/notify';
import { canManageCohorts, isMember, seatsLeft, assignmentContext, assignPeerReview, gmt } from '../../../lib/cohorts';

export const prerender = false;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const at = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rejoindre'), cohortId: z.uuid() }),
  z.object({ action: z.literal('quitter'), cohortId: z.uuid() }),
  z.object({ action: z.literal('rendre'), assignmentId: z.uuid(), body: z.string().trim().min(30).max(8000), link: z.union([z.literal(''), z.url().max(500)]).optional() }),
  z.object({ action: z.literal('evaluer'), assignmentId: z.uuid() }),
  z.object({ action: z.literal('noter'), reviewId: z.uuid(), score: z.number().int().min(1).max(5), comment: z.string().trim().min(20).max(2000) }),
  z.object({ action: z.literal('creer'), courseId: z.string().max(40), name: z.string().trim().min(3).max(120), startsOn: day, endsOn: day, seats: z.number().int().min(2).max(1000).nullable().optional() }),
  z.object({ action: z.literal('session'), cohortId: z.uuid(), title: z.string().trim().min(3).max(160), startsAt: at, minutes: z.number().int().min(15).max(480), link: z.union([z.literal(''), z.url().max(500)]).optional() }),
  z.object({ action: z.literal('devoir'), cohortId: z.uuid(), title: z.string().trim().min(3).max(160), instructions: z.string().trim().min(10).max(4000), dueAt: at, reviewsRequired: z.number().int().min(0).max(5) }),
  z.object({ action: z.literal('retirer'), kind: z.enum(['session', 'devoir']), id: z.uuid() }),
]);
const STAFF = new Set(['creer', 'session', 'devoir', 'retirer']);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'cohortes', 60, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) {
    const k = p.error.issues[0]?.path.at(-1);
    return fail(k === 'body' ? 'Votre travail doit compter au moins 30 caractères.' : k === 'comment' ? 'Votre commentaire doit compter au moins 20 caractères : dites ce qui est réussi et ce qui peut être amélioré.' : k === 'link' ? 'Lien invalide (adresse complète en https://).' : 'Données invalides.');
  }
  const b = p.data;
  if (STAFF.has(b.action)) {
    if (!canManageCohorts(u.roles)) return fail('Accès refusé.', 403);
    if (needs2fa(u.roles) && !u.twoFactorEnabled) return fail('Double authentification requise.', 403);
  }
  const ip = clientIp(request);

  switch (b.action) {
    case 'rejoindre': {
      const [c] = await db.select().from(academyCohort).where(eq(academyCohort.id, b.cohortId));
      if (!c) return fail('Cohorte introuvable.', 404);
      if (c.endsOn < new Date().toISOString().slice(0, 10)) return fail('Cette cohorte est terminée.');
      if (await isMember(c.id, u.id)) return json({ ok: true, message: 'Vous faites déjà partie de cette cohorte.', redirect: `/academie/cohorte/${c.id}` });
      if ((await seatsLeft(c)) === 0) return fail('Cohorte complète.');
      const course = await findCourse(c.courseId, { hidden: true });
      if (!course) return fail('Cours introuvable.', 404);
      const [enr] = await db.select().from(enrollment).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, course.id)));
      if (!enr) {
        if (course.price) return json({ ok: false, error: 'Ce cours est payant : inscrivez-vous d’abord au cours, puis rejoignez la cohorte.', redirect: `/academie/${course.id}` }, 402);
        await db.insert(enrollment).values({ userId: u.id, courseId: course.id }).onConflictDoNothing();
      }
      await db.insert(academyCohortMember).values({ cohortId: c.id, userId: u.id }).onConflictDoNothing();
      await audit(u.id, 'academie.cohorte.adhesion', c.id, {}, ip);
      return json({ ok: true, message: `Bienvenue dans la cohorte « ${c.name} ».`, redirect: `/academie/cohorte/${c.id}` });
    }
    case 'quitter': {
      await db.delete(academyCohortMember).where(and(eq(academyCohortMember.cohortId, b.cohortId), eq(academyCohortMember.userId, u.id)));
      await audit(u.id, 'academie.cohorte.depart', b.cohortId, {}, ip);
      return json({ ok: true, message: 'Vous avez quitté la cohorte.', redirect: '/academie/cohortes' });
    }
    case 'rendre': {
      const ctx = await assignmentContext(b.assignmentId);
      if (!ctx || !(await isMember(ctx.c.id, u.id))) return fail('Réservé aux membres de la cohorte.', 403);
      if (ctx.a.dueAt.getTime() < Date.now()) return fail('La date limite de ce devoir est passée.');
      await db.insert(academySubmission).values({ assignmentId: ctx.a.id, userId: u.id, body: b.body, link: b.link || null })
        .onConflictDoUpdate({ target: [academySubmission.assignmentId, academySubmission.userId], set: { body: b.body, link: b.link || null, submittedAt: new Date() } });
      await audit(u.id, 'academie.devoir.rendu', ctx.a.id, {}, ip);
      return json({ ok: true, message: ctx.a.reviewsRequired ? `Travail rendu. Évaluez maintenant ${ctx.a.reviewsRequired > 1 ? `${ctx.a.reviewsRequired} travaux de vos pairs` : 'le travail d’un pair'}.` : 'Travail rendu.' });
    }
    case 'evaluer': {
      const r = await assignPeerReview(u.id, b.assignmentId);
      if ('error' in r) return fail(r.error);
      return json({ ok: true, reviewId: r.reviewId, message: 'Un travail vous est attribué : évaluez-le ci-dessous.' });
    }
    case 'noter': {
      const [r] = await db.select({ r: academyReview, owner: academySubmission.userId, assignmentId: academySubmission.assignmentId }).from(academyReview)
        .innerJoin(academySubmission, eq(academySubmission.id, academyReview.submissionId)).where(eq(academyReview.id, b.reviewId));
      if (!r || r.r.reviewerId !== u.id) return fail('Évaluation introuvable.', 404);
      await db.update(academyReview).set({ score: b.score, comment: b.comment, doneAt: r.r.doneAt ?? new Date() }).where(eq(academyReview.id, r.r.id));
      if (!r.r.doneAt) {
        const ctx = await assignmentContext(r.assignmentId);
        await notify(r.owner, `Votre travail « ${ctx?.a.title ?? 'devoir'} » a reçu une évaluation d’un pair.`, `/academie/cohorte/${ctx?.c.id ?? ''}#devoirs`);
      }
      return json({ ok: true, message: 'Évaluation enregistrée. Merci pour votre retour !' });
    }
    case 'creer': {
      const course = await findCourse(b.courseId, { hidden: true });
      if (!course) return fail('Cours introuvable.', 404);
      if (b.endsOn < b.startsOn) return fail('La date de fin précède la date de début.');
      const [c] = await db.insert(academyCohort).values({ courseId: course.id, name: b.name, startsOn: b.startsOn, endsOn: b.endsOn, seats: b.seats ?? null, createdBy: u.id }).returning();
      await audit(u.id, 'academie.cohorte.creation', c.id, { course: course.id }, ip);
      return json({ ok: true, message: 'Cohorte créée.', redirect: `/academie/cohorte/${c.id}` });
    }
    case 'session': {
      const startsAt = gmt(b.startsAt);
      if (Number.isNaN(startsAt.getTime())) return fail('Date invalide.');
      await db.insert(academySession).values({ cohortId: b.cohortId, title: b.title, startsAt, minutes: b.minutes, link: b.link || null });
      const members = await db.select({ id: academyCohortMember.userId }).from(academyCohortMember).where(eq(academyCohortMember.cohortId, b.cohortId));
      for (const m of members) await notify(m.id, `Nouvelle session en direct : « ${b.title} » le ${startsAt.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} (GMT).`, `/academie/cohorte/${b.cohortId}`);
      await audit(u.id, 'academie.cohorte.session', b.cohortId, { titre: b.title }, ip);
      return json({ ok: true, message: 'Session ajoutée ; les membres sont prévenus.' });
    }
    case 'devoir': {
      const dueAt = gmt(b.dueAt);
      if (Number.isNaN(dueAt.getTime())) return fail('Date invalide.');
      await db.insert(academyAssignment).values({ cohortId: b.cohortId, title: b.title, instructions: b.instructions, dueAt, reviewsRequired: b.reviewsRequired });
      const members = await db.select({ id: academyCohortMember.userId }).from(academyCohortMember).where(eq(academyCohortMember.cohortId, b.cohortId));
      for (const m of members) await notify(m.id, `Nouveau devoir : « ${b.title} », à rendre avant le ${dueAt.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} (GMT).`, `/academie/cohorte/${b.cohortId}#devoirs`);
      await audit(u.id, 'academie.cohorte.devoir', b.cohortId, { titre: b.title }, ip);
      return json({ ok: true, message: 'Devoir publié ; les membres sont prévenus.' });
    }
    case 'retirer': {
      if (b.kind === 'session') await db.delete(academySession).where(eq(academySession.id, b.id));
      else await db.delete(academyAssignment).where(eq(academyAssignment.id, b.id));
      await audit(u.id, `academie.cohorte.retrait_${b.kind}`, b.id, {}, ip);
      return json({ ok: true, message: b.kind === 'session' ? 'Session retirée.' : 'Devoir retiré (avec les travaux rendus).' });
    }
  }
};
