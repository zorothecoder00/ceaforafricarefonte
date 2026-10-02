/* Demandes adressées aux équipes CEA depuis les pages publiques (CDC §6, §12, §21 : aucun formulaire factice).
   Chaque demande est enregistrée comme message routé vers l'équipe concernée (back-office « Messages »), avec numéro de suivi.
   POST { type, name?, contact?, message, website?, …autres champs } : les autres champs texte sont joints au message comme détails. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { contactMessage, profile } from '../../db/schema/app';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { sendEmail } from '../../lib/messaging';
import { env } from '../../lib/env';
import { eq } from 'drizzle-orm';
import { acknowledge, dueFrom } from '../../lib/support';

export const prerender = false;

type Kind = { motif: string; team: string; delay: string; login?: boolean };
export const DEMANDES: Record<string, Kind> = {
  interview: { motif: "Presse et médias — demande d'interview", team: 'Communication', delay: '3 jours ouvrés' },
  support: { motif: 'Assistance technique — ticket', team: 'Support', delay: '1 jour ouvré' },
  conseil: { motif: 'Accompagnement — demande de rappel', team: 'Équipe programmes', delay: '2 jours ouvrés' },
  evenement: { motif: "Événements — proposition d'événement", team: 'Équipe Events', delay: '5 jours ouvrés' },
  sponsor: { motif: 'Événements — dossier de sponsoring', team: 'Équipe Events', delay: '2 jours ouvrés', login: true },
  deal: { motif: 'Kapital Invest — deal proposé', team: "Équipe d'investissement", delay: '10 jours ouvrés' },
  reclamation: { motif: 'Kapital Invest — réclamation', team: 'Conformité', delay: '10 jours ouvrés (accusé de réception sous 48 heures)' },
  question_ag: { motif: 'Club des actionnaires — question écrite', team: 'Vie associative', delay: "avant l'assemblée", login: true },
  alerte_programme: { motif: "Programmes — alerte d'ouverture", team: 'Équipe programmes', delay: "dès l'ouverture des candidatures", login: true },
};

const Body = z.object({
  type: z.string().refine((t) => t in DEMANDES),
  name: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(160).optional(),
  message: z.string().trim().min(3).max(5000),
});
const KNOWN = new Set(['type', 'name', 'contact', 'message', 'website']);
const when = (k: Kind) => (/^(avant|dès)/.test(k.delay) ? k.delay : `sous ${k.delay}`);

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'demande', 10);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true, message: 'Demande envoyée.' });
  const p = Body.safeParse(raw);
  if (!p.success) return fail('Complétez les champs obligatoires du formulaire.');
  const k = DEMANDES[p.data.type];
  const u = locals.user;
  if (k.login && !u) return fail('Connectez-vous pour envoyer cette demande.', 401);
  const name = u?.name ?? p.data.name;
  const contact = u?.email ?? p.data.contact;
  if (!name || name.length < 2 || !contact || contact.length < 5) return fail('Indiquez votre nom et un e-mail ou un téléphone pour être recontacté·e.');
  const details = Object.entries(raw ?? {}).filter(([key, v]) => !KNOWN.has(key) && typeof v === 'string' && v.trim()).slice(0, 12).map(([key, v]) => `${key} : ${String(v).trim().slice(0, 500)}`).join('\n');
  const message = details ? `${p.data.message}\n\n${details}` : p.data.message;
  const [pr] = u ? await db.select({ c: profile.country }).from(profile).where(eq(profile.userId, u.id)) : [];
  const ref = reference('DEM');
  await db.insert(contactMessage).values({ reference: ref, motif: k.motif, routedTeam: k.team, country: pr?.c ?? null, name, contact, message, userId: u?.id ?? null, priority: p.data.type === 'reclamation' ? 'haute' : 'normale', dueAt: /^(avant|dès)/.test(k.delay) ? null : dueFrom(k.delay) });
  await audit(u?.id, 'demande.' + p.data.type, ref, { team: k.team }, clientIp(request));
  await acknowledge({ reference: ref, name, contact, team: k.team, delay: when(k), userId: u?.id });
  const inbox = env('CONTACT_EMAIL');
  if (inbox) await sendEmail(inbox, `[${k.team}] ${k.motif} — ${ref}`, `${name} (${contact})\n\n${message}`).catch(() => {});
  return json({ ok: true, reference: ref, message: `Demande ${ref} transmise à : ${k.team}. Réponse ${when(k)}.` });
};
