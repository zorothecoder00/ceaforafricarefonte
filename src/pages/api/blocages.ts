/* Bloquer / débloquer un membre (CDC §7.8 : signalement, blocage). POST { userId, block: boolean } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { userBlock } from '../../db/schema/app';
import { json, fail, requireUser, audit } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ userId: z.string(), block: z.boolean().default(true) }).safeParse(await request.json().catch(() => null));
  if (!p.success || p.data.userId === u.id) return fail('Données invalides.');
  if (p.data.block) await db.insert(userBlock).values({ blockerId: u.id, blockedId: p.data.userId }).onConflictDoNothing();
  else await db.delete(userBlock).where(and(eq(userBlock.blockerId, u.id), eq(userBlock.blockedId, p.data.userId)));
  await audit(u.id, p.data.block ? 'membre.blocage' : 'membre.deblocage', p.data.userId);
  return json({ ok: true, message: p.data.block ? 'Membre bloqué : il ne peut plus vous écrire.' : 'Membre débloqué.' });
};
