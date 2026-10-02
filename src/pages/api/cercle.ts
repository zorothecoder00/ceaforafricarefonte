/* Mon cercle Mastermind (CDC §7.5) — réservé aux membres du cercle.
   POST { action: 'engagement', text, quarter } · PATCH { commitmentId, status } · PUT { sessionId, agenda?, minutes?, rating? } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { circleMember, circleCommitment, circleSession, circle } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

async function myCircle(userId: string) {
  const [m] = await db.select({ id: circleMember.circleId }).from(circleMember).where(eq(circleMember.userId, userId));
  return m?.id ?? null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const c = await myCircle(u.id);
  if (!c) return fail('Vous n’êtes membre d’aucun cercle.', 403);
  const p = z.object({ action: z.literal('engagement'), text: z.string().trim().min(3).max(300), quarter: z.string().regex(/^\d{4}-T[1-4]$/) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Décrivez votre engagement.');
  await db.insert(circleCommitment).values({ circleId: c, userId: u.id, text: p.data.text, quarter: p.data.quarter });
  return json({ ok: true, message: 'Engagement ajouté.' });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ commitmentId: z.uuid(), status: z.enum(['en_cours', 'atteint', 'reporte']) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  await db.update(circleCommitment).set({ status: p.data.status }).where(and(eq(circleCommitment.id, p.data.commitmentId), eq(circleCommitment.userId, u.id)));
  return json({ ok: true, message: 'Engagement mis à jour.' });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const c = await myCircle(u.id);
  const p = z.object({ sessionId: z.uuid(), agenda: z.string().max(3000).optional(), minutes: z.string().max(20000).optional(), rating: z.coerce.number().int().min(1).max(5).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [s] = await db.select().from(circleSession).where(eq(circleSession.id, p.data.sessionId));
  const [cr] = s ? await db.select({ fac: circle.facilitatorId }).from(circle).where(eq(circle.id, s.circleId)) : [];
  if (!s || (s.circleId !== c && cr?.fac !== u.id)) return fail('Accès refusé.', 403);
  const set: Partial<typeof circleSession.$inferInsert> = {};
  if (p.data.agenda !== undefined) set.agenda = p.data.agenda;
  if (p.data.minutes !== undefined) set.minutes = p.data.minutes; // compte rendu : visible des seuls membres du cercle
  if (p.data.rating) set.ratings = { ...(s.ratings as Record<string, number>), [u.id]: p.data.rating };
  await db.update(circleSession).set(set).where(eq(circleSession.id, s.id));
  return json({ ok: true, message: p.data.rating ? 'Merci pour votre évaluation.' : 'Enregistré.' });
};
