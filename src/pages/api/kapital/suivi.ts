/* Liste de suivi et alertes (CDC §8.6) : POST { item, follow, alertPct? }. item : « dossier:<uuid> », « indice:brvm », « societe:<nom> ». */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { watchlist } from '../../../db/schema/kapital';
import { json, fail, requireUser } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ item: z.string().regex(/^(dossier|indice|societe):.{1,80}$/), follow: z.boolean().default(true), alertPct: z.coerce.number().int().min(1).max(50).optional().nullable() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Élément invalide.');
  if (p.data.follow) await db.insert(watchlist).values({ userId: u.id, item: p.data.item, alertPct: p.data.alertPct ?? null }).onConflictDoUpdate({ target: [watchlist.userId, watchlist.item], set: { alertPct: p.data.alertPct ?? null } });
  else await db.delete(watchlist).where(and(eq(watchlist.userId, u.id), eq(watchlist.item, p.data.item)));
  return json({ ok: true, message: p.data.follow ? (p.data.alertPct ? `Suivi avec alerte à ±${p.data.alertPct} %.` : 'Ajouté à votre liste de suivi.') : 'Retiré de votre liste de suivi.' });
};
