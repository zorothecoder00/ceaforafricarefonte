/* Favoris (CDC §9) : articles, cours et événements enregistrés pour plus tard (les offres d'emploi passent par /api/emplois).
   POST { kind, itemId, save? } — connexion requise. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { savedItem } from '../../db/schema/app';
import { ARTICLES, COURSES, EVENTS } from '../../data/site';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

const KNOWN: Record<string, string[]> = { article: ARTICLES.map((a) => a.id), course: COURSES.map((c) => c.id), event: EVENTS.map((e) => e.id) };
const Body = z.object({ kind: z.enum(['article', 'course', 'event']), itemId: z.string().max(40), save: z.boolean().default(true) });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success || !KNOWN[p.data.kind].includes(p.data.itemId)) return fail('Contenu introuvable.', 404);
  const { kind, itemId, save } = p.data;
  if (save) await db.insert(savedItem).values({ userId: u.id, kind, itemId }).onConflictDoNothing();
  else await db.delete(savedItem).where(and(eq(savedItem.userId, u.id), eq(savedItem.kind, kind), eq(savedItem.itemId, itemId)));
  return json({ ok: true, message: save ? 'Enregistré dans vos favoris (Mon espace).' : 'Retiré de vos favoris.' });
};
