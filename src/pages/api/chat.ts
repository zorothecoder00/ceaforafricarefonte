/* Conversation en direct avec l'équipe (CDC §10 centre d'aide). Chaque conversation est un ticket « Conversation en direct »
   (équipe Support, priorité haute) : l'équipe répond depuis le back-office (Messages et signalements), le demandeur depuis la
   fenêtre de discussion, qui interroge le fil toutes les quelques secondes. Le demandeur répond via POST /api/support.
   POST { name?, contact?, body, lang }   → ouvre la conversation ; renvoie { ref, k } (clé de suivi conservée par le navigateur)
   GET  ?ref=…&k=…                        → état et messages du fil */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { contactMessage, ticketReply, userRole } from '../../db/schema/app';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { notify } from '../../lib/notify';
import { emit } from '../../lib/automations';
import { signRef, ticketFor, dueFrom, CHAT_MOTIF, teamOnline } from '../../lib/support';
import { ROLES, can } from '../../lib/rbac';

export const prerender = false;

const TEAM = 'Support';

const Start = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  contact: z.string().trim().min(5).max(160).optional(),
  body: z.string().trim().min(2).max(2000),
  lang: z.enum(['fr', 'en']).default('fr'),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'chat', 5);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true });
  const p = Start.safeParse(raw);
  if (!p.success) return fail(raw?.lang === 'en' ? 'Write your message.' : 'Écrivez votre message.');
  const me = locals.user;
  const name = me?.name ?? p.data.name, contact = me?.email ?? p.data.contact;
  if (!name || !contact) return fail(p.data.lang === 'en' ? 'Give your name and an email or phone number so we can reply.' : 'Indiquez votre nom et un e-mail ou un téléphone pour que l’équipe puisse vous répondre.');
  const ref = reference('CHAT');
  await db.insert(contactMessage).values({ reference: ref, motif: CHAT_MOTIF, routedTeam: TEAM, name, contact, message: p.data.body, userId: me?.id ?? null, priority: 'haute', dueAt: dueFrom('2 heures') });
  await emit('ticket.cree', { reference: ref, motif: CHAT_MOTIF, equipe: TEAM, pays: null, priorite: 'haute' }, ref);
  await audit(me?.id, 'chat.ouverture', ref, {}, clientIp(request));
  // Alerte des personnes qui traitent les messages (droit M sur messages_contact)
  const roles = ROLES.filter((r) => can([r], 'messages_contact', 'M'));
  const staff = roles.length ? await db.selectDistinct({ id: userRole.userId }).from(userRole).where(inArray(userRole.role, roles)) : [];
  for (const s of staff) await notify(s.id, `Conversation en direct ${ref} : ${name} attend une réponse.`, '/admin/messages?statut=nouveau');
  return json({ ok: true, ref, k: signRef('ticket', ref), online: teamOnline() });
};

export const GET: APIRoute = async ({ url, locals }) => {
  const t = await ticketFor(url.searchParams.get('ref') ?? '', url.searchParams.get('k'), locals.user?.id);
  if (!t) return fail('Conversation introuvable.', 404);
  const replies = await db.select({ staff: ticketReply.fromStaff, body: ticketReply.body, at: ticketReply.createdAt }).from(ticketReply).where(eq(ticketReply.messageId, t.id)).orderBy(asc(ticketReply.createdAt));
  return json({
    ok: true, status: t.status, online: teamOnline(),
    messages: [{ staff: false, body: t.message, at: t.createdAt }, ...replies],
  });
};
