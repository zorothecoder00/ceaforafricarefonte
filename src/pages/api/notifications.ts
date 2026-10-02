/* Centre de notifications : POST { ids?: string[] } marque comme lues (toutes si ids absent). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../lib/db';
import { notification } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ ids: z.array(z.uuid()).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!p.success) return fail('Données invalides.');
  const where = and(eq(notification.userId, u.id), isNull(notification.readAt), p.data.ids?.length ? inArray(notification.id, p.data.ids) : undefined);
  await db.update(notification).set({ readAt: new Date() }).where(where);
  return json({ ok: true, message: 'Notifications marquées comme lues.' });
};
