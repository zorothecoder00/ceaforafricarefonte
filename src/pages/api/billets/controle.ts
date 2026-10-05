/* Contrôle d'accès aux événements (CDC §7.3) : validation des billets à l'entrée par l'équipe d'accueil.
   GET  ?event=<id>              → compteurs (attendus, entrés) et dernières entrées
   POST { code }                 → valide l'entrée (une seule fois par billet) ; l'attestation de présence devient vérifiable
   Réservé aux rôles autorisés sur l'objet « controle_acces » (matrice §18). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { eventTicket } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { findEvent } from '../../../lib/catalog';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const u = staffApi(locals.user, 'controle_acces', 'L');
  if (u instanceof Response) return u;
  const ev = url.searchParams.get('event') ?? '';
  if (!(await findEvent(ev, { hidden: true }))) return fail('Événement inconnu.', 404);
  const live = and(eq(eventTicket.eventId, ev), inArray(eventTicket.status, ['valide', 'utilise']));
  const [{ expected }] = await db.select({ expected: count() }).from(eventTicket).where(live);
  const [{ inside }] = await db.select({ inside: count() }).from(eventTicket).where(and(live, isNotNull(eventTicket.checkedInAt)));
  const last = await db.select({ code: eventTicket.code, name: eventTicket.holderName, type: eventTicket.ticketType, at: eventTicket.checkedInAt }).from(eventTicket)
    .where(and(eq(eventTicket.eventId, ev), isNotNull(eventTicket.checkedInAt))).orderBy(desc(eventTicket.checkedInAt)).limit(8);
  return json({ ok: true, expected, inside, last });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'controle_acces', 'V');
  if (u instanceof Response) return u;
  const p = z.object({ code: z.string().trim().min(4).max(60), event: z.string().max(20).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Code manquant.');
  const code = p.data.code.toUpperCase().replace(/^.*\/VERIFIER\/BILLET\//, ''); // QR = adresse de vérification ou code seul
  const [t] = await db.select().from(eventTicket).where(eq(eventTicket.code, code));
  if (!t) return json({ ok: true, result: 'inconnu', message: 'Billet inconnu.' });
  const ev = await findEvent(t.eventId, { hidden: true });
  if (p.data.event && p.data.event !== t.eventId) return json({ ok: true, result: 'autre', message: `Billet valable pour un autre événement : ${ev?.t ?? t.eventId}.` });
  if (t.status !== 'valide' && !t.checkedInAt) return json({ ok: true, result: 'invalide', message: `Billet ${t.status}.` });
  // Mise à jour conditionnelle : deux appareils qui scannent en même temps ne valident qu'une fois
  const [done] = await db.update(eventTicket).set({ checkedInAt: new Date(), status: 'utilise' })
    .where(and(eq(eventTicket.id, t.id), eq(eventTicket.status, 'valide'), sql`${eventTicket.checkedInAt} is null`)).returning();
  if (!done) {
    const [again] = await db.select({ at: eventTicket.checkedInAt }).from(eventTicket).where(eq(eventTicket.id, t.id));
    return json({ ok: true, result: 'deja', message: `Déjà utilisé${again?.at ? ' le ' + again.at.toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' (GMT)' : ''}.` });
  }
  await audit(u.id, 'billet.entree', t.code, { event: t.eventId }, clientIp(request));
  return json({ ok: true, result: 'valide', message: 'Entrée validée.', ticket: { code: t.code, name: t.holderName, type: t.ticketType, event: ev?.t ?? t.eventId } });
};
