/* Demande d'un document non encore publié en ligne (CDC §21 : aucun bouton factice).
   Tant que le fichier n'est pas mis en ligne (champ « pdf » ou « url » des données), le bouton enregistre une demande nominative,
   routée vers l'équipe qui détient le document ; elle l'envoie par e-mail. POST { kind, ref } — connexion requise. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { contactMessage, profile } from '../../db/schema/app';
import { json, fail, requireUser, reference, audit, clientIp } from '../../lib/session';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/guard';
import { STUDIES, TENDERS, RESEARCH } from '../../data/site';
import { CLUB_DOCS, PRESS_KIT, REPORTS, POLICIES } from '../../data/documents';
import { TOOLS } from '../../data/proto';

export const prerender = false;

const KINDS: Record<string, { team: string; label: string; known: string[] }> = {
  etude: { team: 'Communication', label: 'Étude', known: STUDIES.map((s) => s.t) },
  appel_offres: { team: 'Direction des partenariats', label: "Dossier d'appel d'offres", known: TENDERS.map((t) => t.t) },
  club: { team: 'Vie associative', label: 'Document du club des actionnaires', known: CLUB_DOCS },
  presse: { team: 'Communication', label: 'Kit média', known: PRESS_KIT },
  transparence: { team: 'Direction générale', label: 'Document de transparence', known: [...REPORTS, ...POLICIES] },
  recherche: { team: 'Équipe Capital Markets', label: 'Note de recherche', known: RESEARCH.filter((r) => !r.p).map((r) => r.t) },
  outil: { team: 'Équipe programmes', label: 'Modèle de la boîte à outils', known: TOOLS.map((t) => t.t) },
};

const Body = z.object({ kind: z.enum(['etude', 'appel_offres', 'club', 'presse', 'transparence', 'outil', 'recherche']), ref: z.string().min(1).max(200) });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'doc:' + u.id, 15, 3600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Demande invalide.');
  const k = KINDS[p.data.kind];
  if (!k.known.includes(p.data.ref)) return fail('Document inconnu.', 404);
  const subject = `${k.label} : ${p.data.ref}`;
  const [open] = await db.select({ r: contactMessage.reference }).from(contactMessage).where(and(eq(contactMessage.userId, u.id), eq(contactMessage.message, subject), eq(contactMessage.status, 'nouveau')));
  if (open) return json({ ok: true, message: `Demande ${open.r} déjà enregistrée : le document vous sera envoyé par e-mail.` });
  const [pr] = await db.select({ c: profile.country }).from(profile).where(eq(profile.userId, u.id));
  const ref = reference('DOC');
  await db.insert(contactMessage).values({ reference: ref, motif: 'Demande de document', routedTeam: k.team, country: pr?.c ?? null, name: u.name, contact: u.email, message: subject, userId: u.id });
  await audit(u.id, 'document.demande', ref, { kind: p.data.kind, ref: p.data.ref }, clientIp(request));
  await notify(u.id, `Demande ${ref} reçue : « ${p.data.ref} » vous sera envoyé par e-mail.`);
  return json({ ok: true, message: `Demande ${ref} enregistrée : le document vous sera envoyé à ${u.email}.` });
};
