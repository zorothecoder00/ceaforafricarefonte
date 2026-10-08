/* Accord du participant pour les sponsors (CDC §7.3, §15.1) : POST { code, consent } sur un billet de son compte.
   Donné, les sponsors qui scannent son badge voient son nom et son e-mail ; retiré, ces coordonnées leur sont aussitôt masquées. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { eventTicket, consent } from '../../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ code: z.string().min(4).max(60), consent: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [t] = await db.update(eventTicket).set({ sponsorConsent: p.data.consent }).where(and(eq(eventTicket.code, p.data.code), eq(eventTicket.userId, u.id))).returning({ code: eventTicket.code });
  if (!t) return fail('Billet introuvable.', 404);
  await db.insert(consent).values({ userId: u.id, kind: 'contacts_sponsors', granted: p.data.consent, ip: clientIp(request) });
  await audit(u.id, p.data.consent ? 'billet.sponsors.accord' : 'billet.sponsors.retrait', t.code, {}, clientIp(request));
  return json({ ok: true, message: p.data.consent ? 'Les sponsors qui scannent votre badge recevront votre nom et votre e-mail.' : 'Vos coordonnées sont masquées aux sponsors.' });
};
