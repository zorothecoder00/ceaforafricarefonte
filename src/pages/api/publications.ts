/* Fil d'actualité (CDC §7.8) : POST { body, spaceId? } publie ; POST { like: postId } aime / n'aime plus.
   Modération : les messages contenant des motifs suspects (paiement préalable, contact externe…) passent en modération. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { post, postLike, space } from '../../db/schema/app';
import { json, fail, requireUser, audit } from '../../lib/session';
import { rateLimit } from '../../lib/guard';

export const prerender = false;

const SUSPECT = /(western union|moneygram|frais de dossier|payez d'abord|investissement garanti|rendement garanti|crypto.{0,20}doubl|whatsapp\s*\+?\d{8,})/i;

const Body = z.union([
  z.object({ body: z.string().trim().min(3).max(3000), spaceId: z.string().max(60).optional().nullable() }),
  z.object({ like: z.uuid() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Publication vide ou trop longue.');
  if ('like' in p.data) {
    const key = and(eq(postLike.postId, p.data.like), eq(postLike.userId, u.id));
    const had = (await db.select().from(postLike).where(key)).length > 0;
    if (had) await db.delete(postLike).where(key);
    else await db.insert(postLike).values({ postId: p.data.like, userId: u.id });
    return json({ ok: true, liked: !had });
  }
  const limited = rateLimit(request, 'post:' + u.id, 10, 3600);
  if (limited) return limited;
  if (p.data.spaceId && !(await db.select({ id: space.id }).from(space).where(eq(space.id, p.data.spaceId))).length) return fail('Espace inconnu.');
  const moderate = SUSPECT.test(p.data.body);
  const [row] = await db.insert(post).values({ authorId: u.id, body: p.data.body, spaceId: p.data.spaceId || null, status: moderate ? 'en_moderation' : 'publie' }).returning();
  if (moderate) await audit(u.id, 'publication.moderation_auto', row.id);
  return json({ ok: true, message: moderate ? 'Publication envoyée en modération (contenu à vérifier).' : 'Publication en ligne.' });
};
