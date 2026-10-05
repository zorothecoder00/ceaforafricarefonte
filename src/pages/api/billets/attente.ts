/* Liste d'attente d'un événement complet. POST { eventId, email } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { eventWaitlist } from '../../../db/schema/app';
import { findEvent } from '../../../lib/catalog';
import { json, fail } from '../../../lib/session';
import { rateLimit, readJson } from '../../../lib/guard';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const limited = rateLimit(request, 'attente', 5);
  if (limited) return limited;
  const p = z.object({ eventId: z.string().max(10), email: z.email() }).safeParse(await readJson(request));
  if (!p.success || !(await findEvent(p.data.eventId))) return fail('Adresse e-mail invalide.');
  await db.insert(eventWaitlist).values({ eventId: p.data.eventId, email: p.data.email.toLowerCase(), userId: locals.user?.id ?? null }).onConflictDoNothing();
  return json({ ok: true, message: 'Vous êtes sur la liste d’attente : nous vous écrivons dès qu’une place se libère.' });
};
