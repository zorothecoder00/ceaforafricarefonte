/* Inscription à un parcours certifiant (CDC §7.6) : inscrit aux cours gratuits du parcours ;
   les cours payants restent à régler un par un (paiement depuis la page du cours). POST { pathId } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { enrollment } from '../../../db/schema/app';
import { PATHS } from '../../../data/site';
import { allCourses } from '../../../lib/catalog';
import { json, fail, requireUser, audit } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ pathId: z.string().max(20) }).safeParse(await request.json().catch(() => null));
  const path = p.success ? PATHS.find((x) => x.id === p.data.pathId) : undefined;
  if (!path) return fail('Parcours introuvable.', 404);
  const catalog = await allCourses();
  const courses = path.c.map((id) => catalog.find((c) => c.id === id)!).filter(Boolean);
  const free = courses.filter((c) => !c.price);
  const paid = courses.filter((c) => c.price);
  if (free.length) await db.insert(enrollment).values(free.map((c) => ({ userId: u.id, courseId: c.id }))).onConflictDoNothing();
  await audit(u.id, 'academie.parcours', path.id, { free: free.map((c) => c.id), paid: paid.map((c) => c.id) });
  const message = paid.length
    ? `Inscription enregistrée à ${free.length} cours gratuit${free.length > 1 ? 's' : ''}. ${paid.length} cours payant${paid.length > 1 ? 's' : ''} à régler depuis sa page : ${paid.map((c) => c.t).join(', ')}.`
    : `Inscription au ${path.t} enregistrée : retrouvez vos cours dans « Mon apprentissage ».`;
  return json({ ok: true, message, redirect: '/espace/apprentissage' });
};
