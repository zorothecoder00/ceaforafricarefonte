/* Tickets du support (CDC §10 centre d'aide, §12 CEA OS « Support ») : liens de suivi signés, échéance de réponse (SLA),
   accusé de réception. Un ticket = une ligne contact_message, son fil = ticket_reply. */
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { contactMessage } from '../db/schema/app';
import { signRef, siteUrl } from './sign';
import { sendEmail } from './messaging';
import { notify } from './notify';

export { signRef, siteUrl };
export const trackPath = (ref: string) => `/aide/suivi?ref=${encodeURIComponent(ref)}&k=${signRef('ticket', ref)}`;

/** Ajoute n jours ouvrés (lundi à vendredi). */
export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d;
}

/** Échéance de réponse à partir du délai annoncé (« 2 jours ouvrés », « 48 heures »…) ; 2 jours ouvrés par défaut. */
export function dueFrom(delay: string, from = new Date()) {
  const h = /(\d+)\s*heures?/.exec(delay);
  if (h && !/jours?/.test(delay.slice(0, h.index))) return new Date(from.getTime() + Number(h[1]) * 3600_000);
  const j = /(\d+)\s*jours?/.exec(delay);
  return addBusinessDays(from, j ? Number(j[1]) : 2);
}

/** Ticket accessible au demandeur : par le lien signé reçu par e-mail, ou connecté en tant qu'auteur de la demande. */
export async function ticketFor(ref: string, key: string | null | undefined, userId: string | undefined) {
  const [t] = await db.select().from(contactMessage).where(eq(contactMessage.reference, ref));
  if (!t) return null;
  const want = signRef('ticket', ref);
  const byKey = !!key && key.length === want.length && timingSafeEqual(Buffer.from(key), Buffer.from(want));
  return byKey || (userId && t.userId === userId) ? t : null;
}

/** Conversation en direct (centre d'aide) : motif des tickets ouverts depuis la fenêtre de discussion. */
export const CHAT_MOTIF = 'Conversation en direct';
/** Heures de présence de l'équipe pour la conversation en direct (lundi–vendredi, 8 h–18 h, heure de Lomé = GMT). */
export const teamOnline = (d = new Date()) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && d.getUTCHours() >= 8 && d.getUTCHours() < 18;

export const PRIORITY_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' } as const;
export const STATUS_LABEL = { nouveau: 'Reçue', en_cours: 'En cours', traite: 'Traitée', clos: 'Close' } as const;

/** Accusé de réception avec lien de suivi : notification pour un membre connecté, e-mail si le contact est une adresse. */
export async function acknowledge(t: { reference: string; name: string; contact: string; team: string; delay: string; userId?: string | null }) {
  const url = new URL(trackPath(t.reference), siteUrl()).href;
  if (t.userId) await notify(t.userId, `Demande ${t.reference} reçue (${t.team}) : réponse ${t.delay}.`, '/espace/demandes');
  if (t.contact.includes('@') && !t.contact.endsWith('@telephone.cea4africa.com')) {
    await sendEmail(t.contact, `Votre demande ${t.reference} a bien été reçue`, `Bonjour ${t.name},\n\nNous avons bien reçu votre demande ${t.reference}, transmise à : ${t.team}.\nRéponse ${t.delay}.\n\nSuivre votre demande et y répondre : ${url}\n\nCEA FOR AFRICA`).catch((e) => console.error('[support] accusé non envoyé :', e instanceof Error ? e.message : e));
  }
}
