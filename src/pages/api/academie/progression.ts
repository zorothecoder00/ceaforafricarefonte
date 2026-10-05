/* Inscription et progression dans un cours (CDC §7.6). Certificat vérifiable délivré à 100 %.
   POST { courseId, lesson?: number, done?: boolean } — sans « lesson » : simple inscription.
   POST { courseId, quiz: number[] } — quiz final corrigé côté serveur ; la dernière leçon n'est validée qu'à 70 % de bonnes réponses. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { enrollment, certificate } from '../../../db/schema/app';
import { PASS_MARK } from '../../../data/course-content';
import { findCourse } from '../../../lib/catalog';
import { json, fail, requireUser, reference, audit } from '../../../lib/session';
import { notify } from '../../../lib/notify';

export const prerender = false;

const Body = z.object({ courseId: z.string().max(20), lesson: z.number().int().min(0).max(50).optional(), done: z.boolean().default(true), quiz: z.array(z.number().int().min(-1).max(10)).max(20).optional() });

export const GET: APIRoute = async ({ locals, url }) => {
  const u = locals.user;
  if (!u) return json({ ok: true, enrolled: false, done: [] });
  const id = url.searchParams.get('course') ?? '';
  const [e] = await db.select().from(enrollment).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, id)));
  const [c] = await db.select({ number: certificate.number }).from(certificate).where(and(eq(certificate.userId, u.id), eq(certificate.subject, id)));
  return json({ ok: true, enrolled: !!e, done: e?.completedLessons ?? [], certificate: c?.number ?? null });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  // Hors ligne compris : un cours dépublié reste consultable et certifiable par les personnes déjà inscrites
  const course = await findCourse(p.data.courseId, { hidden: true });
  if (!course) return fail('Cours introuvable.', 404);
  if (course.price) {
    // Cours payant : l'inscription passe par le paiement (voir /api/paiements)
    const [e] = await db.select().from(enrollment).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, course.id)));
    if (!e) return json({ ok: false, error: 'Ce cours est payant.', pay: { purpose: 'cours', item: course.id } }, 402);
  }
  const [cur] = await db.insert(enrollment).values({ userId: u.id, courseId: course.id }).onConflictDoNothing().returning();
  const [e] = cur ? [cur] : await db.select().from(enrollment).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, course.id)));
  let done = e.completedLessons;
  const quizIndex = course.ls.length - 1; // la dernière leçon est le quiz final
  let quizResult: { score: number; total: number; passed: boolean } | null = null;
  if (p.data.quiz) {
    const qs = course.content.quiz;
    const score = qs.filter((q, i) => p.data.quiz![i] === q.a).length;
    quizResult = { score, total: qs.length, passed: qs.length > 0 && score / qs.length >= PASS_MARK };
    if (quizResult.passed) done = [...new Set([...done, quizIndex])].sort((a, b) => a - b);
  } else if (p.data.lesson === quizIndex) {
    return fail('Le quiz final se valide en répondant aux questions.');
  } else if (p.data.lesson !== undefined && p.data.lesson < course.ls.length) {
    done = p.data.done ? [...new Set([...done, p.data.lesson])].sort((a, b) => a - b) : done.filter((x) => x !== p.data.lesson);
  }
  const complete = done.length === course.ls.length;
  await db.update(enrollment).set({ completedLessons: done, completedAt: complete ? (e.completedAt ?? new Date()) : null }).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, course.id)));
  let cert: string | null = null;
  if (complete) {
    const [existing] = await db.select({ number: certificate.number }).from(certificate).where(and(eq(certificate.userId, u.id), eq(certificate.subject, course.id)));
    cert = existing?.number ?? null;
    if (!cert) {
      cert = reference('CERT');
      await db.insert(certificate).values({ number: cert, userId: u.id, subject: course.id, title: course.t });
      await audit(u.id, 'certificat.delivrance', cert, { course: course.id });
      await notify(u.id, `Certificat obtenu : ${course.t}`, `/verifier/certificat/${cert}`, { email: true });
    }
  }
  const message = quizResult
    ? quizResult.passed
      ? `Quiz réussi : ${quizResult.score}/${quizResult.total}.${complete ? ' Félicitations, votre certificat vérifiable est disponible !' : ' Terminez les autres leçons pour obtenir le certificat.'}`
      : `${quizResult.score}/${quizResult.total} : il faut ${Math.ceil(PASS_MARK * quizResult.total)} bonnes réponses. Relisez les leçons et réessayez.`
    : p.data.lesson === undefined ? 'Inscription confirmée. Bonne formation !' : complete ? 'Félicitations ! Votre certificat vérifiable est disponible.' : 'Progression enregistrée.';
  return json({ ok: true, done, complete, certificate: cert, quiz: quizResult, message });
};
