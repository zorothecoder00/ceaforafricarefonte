/* Billetterie (CDC §7.3).
   POST { eventId, ticket, qty?, promo? } : billet gratuit → émis directement ; payant → redirection vers le paiement ;
   complet → 409 (proposer la liste d'attente). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { eventTicket } from '../../db/schema/app';
import { EVENTS } from '../../data/site';
import { json, fail, requireUser, audit } from '../../lib/session';
import { EVENT_CAPACITY, ticketsSold } from '../../lib/payments';
import { notify } from '../../lib/notify';
import { deliverTickets, contactOf, newTicketCode } from '../../lib/tickets';

export const prerender = false;

const Body = z.object({ eventId: z.string().max(10), ticket: z.coerce.number().int().min(0), qty: z.coerce.number().int().min(1).max(20).default(1), promo: z.string().max(30).optional() });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Sélection invalide.');
  const e = EVENTS.find((x) => x.id === p.data.eventId);
  const tk = e?.tk[p.data.ticket];
  if (!e || !tk) return fail('Billet introuvable.', 404);
  if ((await ticketsSold(e.id)) + p.data.qty > (EVENT_CAPACITY[e.id] ?? Infinity)) return json({ ok: false, error: 'Complet.', waitlist: true }, 409);
  if (tk.p > 0) {
    const qs = new URLSearchParams({ objet: 'billet', ref: `${e.id}:${p.data.ticket}`, qty: String(p.data.qty) });
    if (p.data.promo) qs.set('promo', p.data.promo);
    return json({ ok: true, redirect: `/paiement?${qs}` });
  }
  const issued = await db.insert(eventTicket).values(Array.from({ length: p.data.qty }, () => ({ code: newTicketCode(e.id), eventId: e.id, ticketType: tk.n, priceXof: 0, userId: u.id, holderName: u.name }))).returning();
  await deliverTickets(issued, await contactOf(u.id));
  await audit(u.id, 'billet.gratuit', e.id, { qty: p.data.qty });
  await notify(u.id, `Inscription confirmée : ${e.t}`, '/espace/billets');
  return json({ ok: true, message: 'Inscription confirmée. Votre billet QR est dans « Mon espace › Billets ».', redirect: '/espace/billets' });
};
