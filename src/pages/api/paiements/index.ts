/* Démarre un paiement : POST { objet, ref, qty?, promo? } → { redirect } vers l'agrégateur (ou la simulation en développement). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { mentoringSession } from '../../../db/schema/app';
import { json, fail, requireUser } from '../../../lib/session';
import { resolveItem, startPayment, ticketsSold, EVENT_CAPACITY } from '../../../lib/payments';

export const prerender = false;

const Body = z.object({ objet: z.string().max(30), ref: z.string().max(80), qty: z.number().int().min(1).max(20).optional(), promo: z.string().max(30).optional(), slot: z.string().max(40).optional() });

export const POST: APIRoute = async ({ locals, request, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Commande invalide.');
  const ref = p.data.objet === 'expert' && p.data.slot ? `${p.data.ref}:${p.data.slot}` : p.data.ref;
  const item = await resolveItem(p.data.objet, ref, { qty: p.data.qty, promo: p.data.promo });
  if (!item) return fail('Article introuvable.', 404);
  if (item.purpose === 'billet') {
    const eventId = String(item.meta?.eventId);
    if ((await ticketsSold(eventId)) + Number(item.meta?.qty ?? 1) > (EVENT_CAPACITY[eventId] ?? Infinity)) return fail('Complet : inscrivez-vous sur la liste d’attente.', 409);
  }
  try {
    const pay = await startPayment(u.id, item, url.origin, { name: u.name, email: u.email.endsWith('@telephone.cea4africa.com') ? null : u.email, phone: u.phoneNumber });
    if (item.purpose === 'expert') {
      // Créneau réservé en attente du paiement (confirmé à la réception du paiement)
      const slot = String(item.meta?.slot ?? '');
      const startsAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot) ? new Date(slot) : new Date(Date.now() + 3 * 864e5);
      await db.insert(mentoringSession).values({ kind: 'expert', mentorId: String(item.meta?.expertId), menteeId: u.id, startsAt, priceXof: item.amountXof, paymentId: pay.id, goal: item.label });
    }
    return json({ ok: true, redirect: pay.url, reference: pay.ref });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Paiement impossible.', 503);
  }
};
