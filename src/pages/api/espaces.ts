/* Rejoindre / quitter un espace thématique ou pays. POST { spaceId, join } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { space, spaceMember } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ spaceId: z.string().max(60), join: z.boolean().default(true) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [s] = await db.select().from(space).where(eq(space.id, p.data.spaceId));
  if (!s) return fail('Espace introuvable.', 404);
  if (p.data.join) await db.insert(spaceMember).values({ spaceId: s.id, userId: u.id }).onConflictDoNothing();
  else await db.delete(spaceMember).where(and(eq(spaceMember.spaceId, s.id), eq(spaceMember.userId, u.id)));
  return json({ ok: true, message: p.data.join ? `Vous suivez « ${s.name} ».` : `Vous avez quitté « ${s.name} ».` });
};
