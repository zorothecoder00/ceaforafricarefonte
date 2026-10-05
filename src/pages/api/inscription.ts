/* Inscription des entrepreneurs membres dans leur pays (prototype « Inscription des entrepreneurs »).
   Sans compte : la demande est enregistrée comme message routé vers le bureau de représentation du pays (back-office « Messages »),
   avec numéro de suivi et accusé de réception. POST { prenom, nom, tel, email?, pays, ville?, genre?, ent, forme?, rccm?, annee?, sal?,
   secteur?, besoin?, dom_<id>: bool, need_<n>: bool, annuaire?: bool } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { contactMessage } from '../../db/schema/app';
import { json, fail, reference, audit, clientIp } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { acknowledge, dueFrom } from '../../lib/support';
import { COUNTRIES, DOMAINS, HUBS, NEEDS } from '../../data/site';

export const prerender = false;

const t = (max: number) => z.string().trim().max(max).optional().default('');
const Body = z.object({
  prenom: z.string().trim().min(1).max(80),
  nom: z.string().trim().min(1).max(80),
  tel: z.string().trim().min(6).max(40),
  email: t(160),
  pays: z.string().refine((c) => HUBS.some((h) => h.c === c)),
  ville: t(80), genre: t(20), ent: z.string().trim().min(1).max(160), forme: t(60), rccm: t(60), annee: t(10), sal: t(10), secteur: t(160), besoin: t(2000),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'inscription', 5);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true });
  const p = Body.safeParse(raw);
  if (!p.success) return fail('Indiquez votre prénom, votre nom, votre téléphone, votre pays et le nom de votre entreprise.');
  const d = p.data;
  const doms = DOMAINS.filter((x) => raw?.['dom_' + x.id] === true).map((x) => x.dom);
  if (!doms.length) return fail("Choisissez au moins un domaine d'intervention.");
  const needs = NEEDS.filter((_, i) => raw?.['need_' + i] === true);
  const name = `${d.prenom} ${d.nom}`;
  const contact = d.email || d.tel;
  const team = `Bureau de représentation — ${COUNTRIES[d.pays]}`;
  const message = [
    `Entreprise : ${d.ent}${d.forme ? ` (${d.forme})` : ''}${d.rccm ? ` · RCCM ${d.rccm}` : ''}`,
    `Pays : ${COUNTRIES[d.pays]}${d.ville ? `, ${d.ville}` : ''} · Téléphone : ${d.tel}${d.email ? ` · E-mail : ${d.email}` : ''}`,
    d.annee || d.sal ? `Création : ${d.annee || '—'} · Salariés : ${d.sal || '—'}` : '',
    `Domaines d'intervention : ${doms.join(', ')} (principal : ${doms[0]})`,
    d.secteur ? `Secteur précis : ${d.secteur}` : '',
    needs.length ? `Besoins : ${needs.join(', ')}` : '',
    d.besoin ? `Précisions : ${d.besoin}` : '',
    d.genre ? `Genre : ${d.genre}` : '',
    `Annuaire des membres : ${raw?.annuaire === true ? 'oui' : 'non'}`,
  ].filter(Boolean).join('\n');
  const ref = `MEM-${d.pays}-${reference('').slice(1)}`;
  await db.insert(contactMessage).values({ reference: ref, motif: 'Inscription des entrepreneurs membres', routedTeam: team, country: d.pays, name, contact, message, userId: locals.user?.id ?? null, priority: 'normale', dueAt: dueFrom('2 jours ouvrés') });
  await audit(locals.user?.id, 'inscription.membre', ref, { pays: d.pays, domaines: doms }, clientIp(request));
  await acknowledge({ reference: ref, name, contact, team, delay: 'sous 48 heures', userId: locals.user?.id });
  return json({ ok: true, reference: ref, redirect: '/adherer', message: `Inscription ${ref} reçue. Le bureau ${COUNTRIES[d.pays]} la valide sous 48 heures.` });
};
