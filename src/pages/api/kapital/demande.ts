/* Demandes Kapital Invest (CDC §8) : accompagnement IPO Ready, adhésion à un club ou syndicat, intérêt pour une offre privée d'actions.
   Toutes sont non engageantes (avant agrément : aucun paiement, aucune souscription). Enregistrées comme messages routés vers
   l'équipe concernée (back-office « Messages »), avec numéro de suivi, notification et trace d'audit.
   POST { kind: 'ipo' | 'syndicat' | 'offre_privee', ref, message? } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { contactMessage, profile } from '../../../db/schema/app';
import { json, fail, requireUser, reference, audit, clientIp } from '../../../lib/session';
import { isVerifiedInvestor } from '../../../lib/kapital';
import { notify } from '../../../lib/notify';
import { rateLimit } from '../../../lib/guard';
import { PRIV_OFFERS } from '../../../data/site';

export const prerender = false;

export const CLUBS = ["Club Agritech Afrique de l'Ouest", 'Diaspora Capital Club', 'Women Invest Africa'];

const KINDS = {
  ipo: { motif: 'Kapital Invest — levée de fonds', team: 'Équipe Capital Markets', label: 'Accompagnement IPO Ready', investor: false },
  syndicat: { motif: 'Kapital Invest — investisseur', team: 'Relations investisseurs', label: 'Adhésion à un club d’investisseurs', investor: true },
  offre_privee: { motif: 'Kapital Invest — investisseur', team: 'Relations investisseurs', label: "Intérêt pour une offre privée d'actions", investor: true },
} as const;

const Body = z.object({
  kind: z.enum(['ipo', 'syndicat', 'offre_privee']),
  ref: z.string().trim().min(1).max(120),
  message: z.string().trim().max(2000).optional(),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'kapital-demande:' + u.id, 10, 3600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Demande invalide.');
  const { kind, ref } = p.data;
  const k = KINDS[kind];
  if (kind === 'syndicat' && !CLUBS.includes(ref)) return fail('Club inconnu.');
  if (kind === 'offre_privee' && !PRIV_OFFERS.some((o) => o.n === ref)) return fail('Offre inconnue.');
  if (k.investor && !(await isVerifiedInvestor(u.id))) {
    return json({ ok: false, error: 'Réservé aux investisseurs vérifiés : faites d’abord vérifier votre profil.', redirect: '/kapital/devenir-investisseur' }, 403);
  }
  // Une seule demande ouverte par sujet
  const subject = `${k.label} : ${ref}`;
  const [open] = await db.select({ r: contactMessage.reference }).from(contactMessage)
    .where(and(eq(contactMessage.userId, u.id), eq(contactMessage.motif, k.motif), eq(contactMessage.status, 'nouveau'), eq(contactMessage.message, subject + (p.data.message ? `\n\n${p.data.message}` : ''))));
  if (open) return json({ ok: true, reference: open.r, message: `Votre demande ${open.r} est déjà en cours de traitement.` });
  const [pr] = await db.select({ c: profile.country }).from(profile).where(eq(profile.userId, u.id));
  const num = reference('KAP');
  await db.insert(contactMessage).values({ reference: num, motif: k.motif, routedTeam: k.team, country: pr?.c ?? null, name: u.name, contact: u.email, message: subject + (p.data.message ? `\n\n${p.data.message}` : ''), userId: u.id });
  await audit(u.id, 'kapital.demande.' + kind, num, { ref }, clientIp(request));
  await notify(u.id, `Demande ${num} reçue (${k.label}). ${k.team} vous recontacte sous 5 jours ouvrés.`, '/espace/notifications', { email: true });
  return json({ ok: true, reference: num, message: `Demande ${num} transmise à : ${k.team}. Elle n’engage à rien.` });
};
