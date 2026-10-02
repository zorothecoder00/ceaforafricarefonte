/* Suivi d'une demande par son auteur (CDC §10 centre d'aide) — accès par lien signé (k) ou connecté en tant qu'auteur.
   POST  { ref, k?, body }              → répondre dans le fil (rouvre une demande traitée ou close)
   PATCH { ref, k?, csat, comment? }    → noter la réponse (1 à 5) une fois la demande traitée
   PUT   { article, helpful }           → vote sur un article de la base de connaissances */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { contactMessage, helpFeedback, ticketReply } from '../../db/schema/app';
import { helpArticle } from '../../data/aide';
import { json, fail, audit, clientIp } from '../../lib/session';
import { rateLimit, readJson } from '../../lib/guard';
import { sendEmail } from '../../lib/messaging';
import { notify } from '../../lib/notify';
import { env } from '../../lib/env';
import { ticketFor } from '../../lib/support';

export const prerender = false;

const Ref = { ref: z.string().max(40), k: z.string().max(40).nullish() };

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'support', 20);
  if (limited) return limited;
  const p = z.object({ ...Ref, body: z.string().trim().min(2).max(5000) }).safeParse(await readJson(request));
  if (!p.success) return fail('Écrivez votre message.');
  const t = await ticketFor(p.data.ref, p.data.k, locals.user?.id);
  if (!t) return fail('Demande introuvable.', 404);
  await db.insert(ticketReply).values({ messageId: t.id, authorId: locals.user?.id ?? null, fromStaff: false, body: p.data.body });
  if (t.status === 'traite' || t.status === 'clos') await db.update(contactMessage).set({ status: 'en_cours' }).where(eq(contactMessage.id, t.id));
  await audit(locals.user?.id, 'support.reponse_demandeur', t.reference, {}, clientIp(request));
  if (t.assigneeId) await notify(t.assigneeId, `Nouvelle réponse sur la demande ${t.reference}`, '/admin/messages?statut=en_cours');
  const inbox = env('CONTACT_EMAIL');
  if (inbox) await sendEmail(inbox, `[${t.routedTeam}] Réponse du demandeur — ${t.reference}`, `${t.name} (${t.contact})\n\n${p.data.body}`).catch(() => {});
  return json({ ok: true, message: 'Message envoyé à l’équipe.' });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const p = z.object({ ...Ref, csat: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }).safeParse(await readJson(request));
  if (!p.success) return fail('Choisissez une note de 1 à 5.');
  const t = await ticketFor(p.data.ref, p.data.k, locals.user?.id);
  if (!t) return fail('Demande introuvable.', 404);
  if (t.status !== 'traite' && t.status !== 'clos') return fail('Vous pourrez noter la réponse une fois la demande traitée.');
  await db.update(contactMessage).set({ csat: p.data.csat, csatComment: p.data.comment || null }).where(eq(contactMessage.id, t.id));
  await audit(locals.user?.id, 'support.satisfaction', t.reference, { csat: p.data.csat }, clientIp(request));
  return json({ ok: true, message: 'Merci pour votre avis.' });
};

/* « Cet article vous a-t-il aidé ? » : PUT { article, helpful } (vote anonyme, limité par adresse IP) */
export const PUT: APIRoute = async ({ request }) => {
  const limited = rateLimit(request, 'aide-avis', 30);
  if (limited) return limited;
  const p = z.object({ article: z.string().max(80).refine((s) => !!helpArticle(s)), helpful: z.boolean() }).safeParse(await readJson(request));
  if (!p.success) return fail('Avis invalide.');
  await db.insert(helpFeedback).values(p.data);
  return json({ ok: true, message: p.data.helpful ? 'Merci !' : 'Merci. Dites-nous ce qui manque en ouvrant un ticket.' });
};
