/* Collecte de contacts sur le stand d'un sponsor (CDC §7.3), par son représentant (accès ouvert par l'équipe).
   POST { eventId, code, note? } → enregistre le scan d'un badge ; renvoie nom et e-mail seulement si le participant a accepté
   GET  ?event=<id>&format=csv   → export des contacts dont l'accord est toujours donné */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { eventLead, eventTicket } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { activeAccess, leadsOf, ticketCode } from '../../../lib/event-leads';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'stand', 120, 600);
  if (limited) return limited;
  const p = z.object({ eventId: z.string().min(1).max(40), code: z.string().min(4).max(200), note: z.string().trim().max(500).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Code manquant.');
  const a = await activeAccess(u.id, p.data.eventId);
  if (!a) return fail('Votre accès stand n’est pas ouvert pour cet événement.', 403);
  const [t] = await db.select({ t: eventTicket, uname: user.name, uemail: user.email }).from(eventTicket).leftJoin(user, eq(user.id, eventTicket.userId)).where(eq(eventTicket.code, ticketCode(p.data.code)));
  if (!t || t.t.eventId !== a.eventId || !['valide', 'utilise'].includes(t.t.status)) return json({ ok: true, result: 'inconnu', message: 'Badge inconnu pour cet événement.' });
  await db.insert(eventLead).values({ accessId: a.id, ticketId: t.t.id, note: p.data.note || null })
    .onConflictDoUpdate({ target: [eventLead.accessId, eventLead.ticketId], set: p.data.note ? { note: p.data.note } : { createdAt: new Date() } });
  await audit(u.id, 'evenement.stand.scan', a.eventId, { sponsor: a.sponsorName, consentement: t.t.sponsorConsent }, clientIp(request));
  if (!t.t.sponsorConsent) return json({ ok: true, result: 'sans_accord', message: 'Ce participant n’a pas accepté de partager ses coordonnées. Remettez-lui plutôt votre documentation.' });
  return json({ ok: true, result: 'contact', message: 'Contact enregistré.', contact: { name: t.t.holderName ?? t.uname, email: t.t.holderEmail ?? t.uemail, type: t.t.ticketType } });
};

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const GET: APIRoute = async ({ locals, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const a = await activeAccess(u.id, url.searchParams.get('event') ?? '');
  if (!a) return fail('Votre accès stand n’est pas ouvert pour cet événement.', 403);
  const rows = (await leadsOf(a.id)).filter((r) => r.consent);
  await audit(u.id, 'evenement.stand.export', a.eventId, { sponsor: a.sponsorName, lignes: rows.length });
  const csv = ['Nom;E-mail;Billet;Scanné le (UTC);Note', ...rows.map((r) => [r.name, r.email, r.type, r.at.toISOString().slice(0, 16).replace('T', ' '), r.note].map(cell).join(';'))].join('\r\n');
  return new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="contacts-${a.eventId}.csv"`, 'Cache-Control': 'no-store' } });
};
