/* Formulaire de contact intelligent (CDC §6.2) : routage par motif et par pays, accusé de réception avec numéro. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { contactMessage } from '../../db/schema/app';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { sendEmail } from '../../lib/messaging';
import { env } from '../../lib/env';
import { acknowledge, dueFrom } from '../../lib/support';
import { emit } from '../../lib/automations';

export const prerender = false;

export const TEAMS: Record<string, string> = {
  Accompagnement: 'Équipe programmes',
  'Kapital Invest — levée de fonds': 'Équipe Kapital Invest',
  'Kapital Invest — investisseur': 'Relations investisseurs',
  Partenariat: 'Direction des partenariats',
  'Presse et médias': 'Communication',
  'Assistance technique': 'Support',
  Adhésion: 'Vie associative',
  Réclamation: 'Qualité et réclamations',
  Accessibilité: 'Support',
};

const Body = z.object({
  motif: z.string().refine((m) => m in TEAMS, 'Motif inconnu'),
  country: z.string().length(2).optional(),
  name: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(5).max(160),
  message: z.string().trim().min(10).max(5000),
  consent: z.literal(true, { message: 'Consentement requis' }),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'contact', 5);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true, message: 'Message envoyé.' });
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message === 'Consentement requis' ? 'Cochez la case de consentement.' : 'Complétez le nom, le contact et le message (10 caractères minimum).');
  const ref = reference('MSG');
  const team = TEAMS[p.data.motif];
  await db.insert(contactMessage).values({ reference: ref, motif: p.data.motif, routedTeam: team, country: p.data.country, name: p.data.name, contact: p.data.contact, message: p.data.message, userId: locals.user?.id ?? null, dueAt: dueFrom('2 jours ouvrés') });
  await emit('ticket.cree', { reference: ref, motif: p.data.motif, equipe: team, pays: p.data.country ?? null, priorite: 'normale' }, ref);
  await audit(locals.user?.id, 'contact.message', ref, { team, country: p.data.country }, clientIp(request));
  const inbox = env('CONTACT_EMAIL');
  if (inbox) await sendEmail(inbox, `[${team}] ${p.data.motif} — ${ref}`, `${p.data.name} (${p.data.contact}) — pays : ${p.data.country ?? '—'}\n\n${p.data.message}`).catch(() => {});
  await acknowledge({ reference: ref, name: p.data.name, contact: p.data.contact, team, delay: 'sous 2 jours ouvrés', userId: locals.user?.id });
  return json({ ok: true, reference: ref, message: `Message ${ref} transmis à : ${team}. Réponse sous 2 jours ouvrés. Un lien de suivi vous a été envoyé.` });
};
