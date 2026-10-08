/* Café virtuel (CDC §7.8) : POST { action: 'participer' | 'pause' | 'reprendre' | 'quitter' }
   ou { action: 'retour', matchId, met } (la rencontre a-t-elle eu lieu ?). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { coffeeOptin } from '../../../db/schema/app';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { feedback } from '../../../lib/coffee';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['participer', 'pause', 'reprendre', 'quitter']) }),
  z.object({ action: z.literal('retour'), matchId: z.uuid(), met: z.boolean() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const b = p.data;
  if (b.action === 'retour') {
    if (!(await feedback(b.matchId, u.id, b.met))) return fail('Rencontre introuvable.', 404);
    return json({ ok: true, message: b.met ? 'Merci ! Ravi que l’échange ait eu lieu.' : 'Merci pour votre retour.' });
  }
  if (b.action === 'participer' || b.action === 'reprendre') await db.insert(coffeeOptin).values({ userId: u.id }).onConflictDoUpdate({ target: coffeeOptin.userId, set: { paused: false } });
  else if (b.action === 'pause') await db.update(coffeeOptin).set({ paused: true }).where(eq(coffeeOptin.userId, u.id));
  else await db.delete(coffeeOptin).where(eq(coffeeOptin.userId, u.id));
  await audit(u.id, `communaute.cafe.${b.action}`, u.id);
  const msg = { participer: 'Inscription prise en compte : votre premier binôme arrive lundi.', reprendre: 'Café virtuel repris : binôme lundi prochain.', pause: 'Café virtuel en pause : pas de binôme tant que vous ne reprenez pas.', quitter: 'Vous ne participez plus au café virtuel.' }[b.action];
  return json({ ok: true, message: msg });
};
