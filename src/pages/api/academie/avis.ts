/* Avis sur les cours (CDC §7.6).
   GET ?course=c1 → moyenne, nombre et derniers avis visibles (prénom et pays seulement) + l'avis de l'utilisateur.
   POST { courseId, rating, comment? } → réservé aux inscrits ; un avis par personne, modifiable.
   Un commentaire contenant un lien est retenu pour modération avant publication. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, avg, count, desc, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { courseReview, enrollment, profile } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { findCourse } from '../../../lib/catalog';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';

export const prerender = false;

const Body = z.object({
  courseId: z.string().max(10),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1500).optional(),
});

export const GET: APIRoute = async ({ locals, url }) => {
  const id = url.searchParams.get('course') ?? '';
  if (!(await findCourse(id, { hidden: true }))) return fail('Cours inconnu.', 404);
  const visible = and(eq(courseReview.courseId, id), eq(courseReview.hidden, false));
  const [stats] = await db.select({ n: count(), avg: avg(courseReview.rating) }).from(courseReview).where(visible);
  const rows = await db.select({ name: user.name, c: profile.country, rating: courseReview.rating, comment: courseReview.comment, at: courseReview.at })
    .from(courseReview).innerJoin(user, eq(user.id, courseReview.userId)).leftJoin(profile, eq(profile.userId, courseReview.userId))
    .where(visible).orderBy(desc(courseReview.at)).limit(20);
  const mine = locals.user ? (await db.select().from(courseReview).where(and(eq(courseReview.courseId, id), eq(courseReview.userId, locals.user.id))))[0] : undefined;
  return json({
    ok: true,
    count: stats.n,
    average: stats.avg ? Math.round(Number(stats.avg) * 10) / 10 : null,
    reviews: rows.map((r) => ({ name: r.name.split(' ')[0], country: r.c, rating: r.rating, comment: r.comment, at: r.at })),
    mine: mine ? { rating: mine.rating, comment: mine.comment, hidden: mine.hidden } : null,
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'avis:' + u.id, 10, 3600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Choisissez une note de 1 à 5.');
  if (!(await findCourse(p.data.courseId, { hidden: true }))) return fail('Cours inconnu.', 404);
  const { courseId, rating } = p.data;
  const comment = p.data.comment || null;
  const [e] = await db.select({ id: enrollment.courseId }).from(enrollment).where(and(eq(enrollment.userId, u.id), eq(enrollment.courseId, courseId)));
  if (!e) return fail('Seuls les inscrits peuvent donner leur avis sur ce cours.', 403);
  const hidden = !!comment && /https?:\/\/|www\./i.test(comment);
  await db.insert(courseReview).values({ userId: u.id, courseId, rating, comment, hidden })
    .onConflictDoUpdate({ target: [courseReview.userId, courseReview.courseId], set: { rating, comment, hidden, at: new Date() } });
  await audit(u.id, 'academie.avis', courseId, { rating, hidden });
  return json({ ok: true, message: hidden ? 'Merci ! Votre avis contient un lien : il sera publié après vérification.' : 'Merci pour votre avis !' });
};
