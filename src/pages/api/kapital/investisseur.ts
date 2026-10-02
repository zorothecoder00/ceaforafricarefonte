/* Préférences de l'investisseur (secteurs, pays, tickets) — CDC §8.8. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { investorProfile } from '../../../db/schema/kapital';
import { json, fail, requireUser } from '../../../lib/session';

export const prerender = false;

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({
    sectors: z.array(z.string().max(40)).max(12).default([]),
    countries: z.array(z.string().length(2)).max(20).default([]),
    ticketMinXof: z.coerce.number().int().min(0).max(1e13).nullable().optional(),
    ticketMaxXof: z.coerce.number().int().min(0).max(1e13).nullable().optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Préférences invalides.');
  await db.insert(investorProfile).values({ userId: u.id, ...p.data }).onConflictDoUpdate({ target: investorProfile.userId, set: p.data });
  return json({ ok: true, message: 'Préférences enregistrées : vos recommandations sont mises à jour.' });
};
