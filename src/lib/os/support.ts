/* CEA OS — support et documents (prototype : Support, Documents).
   Tickets : délais cibles par priorité ; l'informatique et la direction voient tout, les managers leur périmètre, chacun ses
   tickets ; les messages du site (contact, inscriptions…) apparaissent aussi, avec l'origine « Site web ».
   Documents : quatre niveaux de confidentialité ; chaque consultation et chaque partage sont journalisés. */
import { canUse, MANAGERS, type OsCtx } from './core';

export const SLA: Record<string, number> = { P1: 4, P2: 24, P3: 72, P4: 240 };
export const PRIO_LABEL: Record<string, string> = { P1: 'Bloquante', P2: 'Importante', P3: 'Normale' };
/** Priorité d'un message du site (contact_message.priority) en P1…P4. */
export const SITE_PRIO: Record<string, string> = { urgente: 'P1', haute: 'P2', normale: 'P3', basse: 'P4' };
export const SITE_STATUS: Record<string, string> = { nouveau: 'Ouvert', en_cours: 'En cours', traite: 'Résolu', clos: 'Résolu' };

export const CONF = ['Public', 'Interne', 'Confidentiel', 'Strictement confidentiel'] as const;
export function canSeeDoc(doc: { confidentiality: string; domain: string | null }, c: Pick<OsCtx, 'me' | 'prof' | 'superuser'>) {
  if (c.superuser) return true;
  const mine = !!c.me?.domain && c.me.domain === doc.domain;
  if (doc.confidentiality === 'Strictement confidentiel') return ['dg', 'conf'].includes(c.prof ?? '') || (mine && ['chef', 'analyste'].includes(c.prof ?? ''));
  if (doc.confidentiality === 'Confidentiel') return canUse(MANAGERS + ' jur conf analyste cond', c) || mine;
  return true;
}
