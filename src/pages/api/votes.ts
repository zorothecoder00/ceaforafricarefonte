/* Consultations (CDC §7.7) : une voix par adhérent, résultats agrégés uniquement.
   GET ?ids=v1,v2 → { counts: { v1: [n, …] }, mine: { v1: index } }   ·   POST { consultationId, option } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db';
import { consultationVote, membership } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { CONSULTS } from '../../data/site';

export const prerender = false;

// Consultations ouvertes : id → nombre d'options et date de clôture ; « live-* » = sondages d'événement (connexion suffit)
const OPEN: Record<string, { n: number; close: string; members: boolean }> = {
  ...Object.fromEntries(CONSULTS.map((c) => [c.id, { n: c.o.length, close: c.close, members: true }])),
  'live-agritech': { n: 4, close: '2026-10-29', members: false },
};

export const GET: APIRoute = async ({ locals, url }) => {
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter((id) => id in OPEN).slice(0, 20);
  if (!ids.length) return json({ counts: {}, mine: {} });
  const rows = await db.select({ id: consultationVote.consultationId, o: consultationVote.optionIndex, n: sql<number>`count(*)::int` }).from(consultationVote).where(inArray(consultationVote.consultationId, ids)).groupBy(consultationVote.consultationId, consultationVote.optionIndex);
  const counts: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, Array(OPEN[id].n).fill(0)]));
  for (const r of rows) if (counts[r.id] && r.o < counts[r.id].length) counts[r.id][r.o] = r.n;
  const mine: Record<string, number> = {};
  if (locals.user) {
    const m = await db.select({ id: consultationVote.consultationId, o: consultationVote.optionIndex }).from(consultationVote).where(and(eq(consultationVote.userId, locals.user.id), inArray(consultationVote.consultationId, ids)));
    for (const r of m) mine[r.id] = r.o;
  }
  return json({ counts, mine, logged: !!locals.user });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ consultationId: z.string(), option: z.coerce.number().int().min(0) }).safeParse(await request.json().catch(() => null));
  if (!p.success || !(p.data.consultationId in OPEN)) return fail('Consultation inconnue.');
  const c = OPEN[p.data.consultationId];
  if (p.data.option >= c.n) return fail('Option invalide.');
  if (new Date(c.close + 'T23:59:59Z') < new Date()) return fail('Cette consultation est close.');
  if (c.members) {
    const [m] = await db.select({ id: membership.userId }).from(membership).where(and(eq(membership.userId, u.id), eq(membership.status, 'active'), or(isNull(membership.endsAt), gt(membership.endsAt, new Date()))));
    if (!m) return fail('Les consultations sont réservées aux adhérents à jour de cotisation.', 403);
  }
  const ins = await db.insert(consultationVote).values({ consultationId: p.data.consultationId, userId: u.id, optionIndex: p.data.option }).onConflictDoNothing().returning();
  if (!ins.length) return fail('Vous avez déjà voté à cette consultation.', 409);
  return json({ ok: true, message: 'Merci, votre vote est enregistré.' });
};
