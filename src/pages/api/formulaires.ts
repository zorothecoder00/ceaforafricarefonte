/* Envoi d'un formulaire public (CDC §12) : contrôle des réponses (champs conditionnels), routage vers une équipe, ticket du support
   avec échéance (SLA), accusé de réception avec numéro et lien de suivi, déclenchement des automatisations.
   POST { formulaire: <slug>, …réponses } */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { contactMessage } from '../../db/schema/app';
import { formDef, formSubmission } from '../../db/schema/workflows';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { FormFields, Rules, checkSubmission, route, contactOf } from '../../lib/forms';
import { acknowledge, dueFrom } from '../../lib/support';
import { emit } from '../../lib/automations';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const limited = rateLimit(request, 'formulaire', 10, 600);
  if (limited) return limited;
  const raw = (await readJson(request)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return fail('Requête invalide.');
  if (isBot(raw)) return json({ ok: true, message: 'Merci.' });
  const slug = String(raw.formulaire ?? '');
  const [f] = /^[a-z0-9-]{1,60}$/.test(slug) ? await db.select().from(formDef).where(eq(formDef.slug, slug)) : [];
  if (!f || f.status !== 'publie') return fail('Formulaire indisponible.', 404);
  const u = locals.user;
  if (f.requireLogin && !u) return fail('Connectez-vous pour envoyer ce formulaire.', 401);
  const fields = FormFields.parse(f.fields), rules = Rules.parse(f.routing);
  const chk = checkSubmission(fields, raw);
  if (!chk.ok) return fail(chk.error);
  const { team, priority } = route(rules, chk.data, f.defaultTeam);
  const contact = contactOf(fields, chk.data) || u?.email || '';
  if (!contact) return fail('Indiquez une adresse e-mail ou un numéro de téléphone pour recevoir la réponse.');
  const name = (u?.name ?? chk.data.nom ?? chk.data.name ?? contact).slice(0, 120);
  const ref = reference('FRM');
  const text = fields.filter((x) => x.key in chk.data).map((x) => `${x.label} : ${chk.data[x.key]}`).join('\n');
  await db.insert(contactMessage).values({ reference: ref, motif: f.title.slice(0, 120), routedTeam: team, name, contact, message: text, userId: u?.id ?? null, priority, dueAt: dueFrom(f.delay) });
  await db.insert(formSubmission).values({ formId: f.id, ticketRef: ref, userId: u?.id ?? null, data: chk.data });
  await audit(u?.id, 'formulaire.soumis', ref, { form: f.slug, team }, clientIp(request));
  await acknowledge({ reference: ref, name, contact, team, delay: `sous ${f.delay}`, userId: u?.id });
  await emit('formulaire.soumis', { formulaire: f.slug, reference: ref, equipe: team, priorite: priority, reponse: chk.data }, ref);
  return json({ ok: true, reference: ref, message: `${f.ack} Numéro de suivi : ${ref}.` });
};
