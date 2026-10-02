/* Enregistre un diagnostic « Suis-je prêt ? » (8 axes notés 1, 3 ou 5). Le score est recalculé côté serveur. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { diagnostic } from '../../../db/schema/kapital';
import { json, fail } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const p = z.object({ answers: z.array(z.union([z.literal(1), z.literal(3), z.literal(5)])).length(8) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Réponses incomplètes.');
  const score = Math.round((p.data.answers.reduce((a, b) => a + b, 0) / 40) * 100);
  if (locals.user) await db.insert(diagnostic).values({ userId: locals.user.id, answers: p.data.answers, score });
  return json({ ok: true, score, saved: !!locals.user });
};
