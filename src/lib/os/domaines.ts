/* CEA OS — domaines d'intervention (prototype : pages « Domaines d'intervention »). Accès : direction, opérations, bureaux
   régionaux et pays, plus le chef et les agents du domaine (analystes et conformité pour Kapital, conducteurs de travaux
   pour le BTP). */
import type { osSiteLot } from '../../db/schema/os';
import type { Dom } from './ref';

export const domSpec = (d: Dom) => `dg adg ops dirreg rep ${d === 'kap' ? 'analyste conf ' : ''}${d === 'btp' ? 'cond ' : ''}chef:${d} agent:${d}`;

/** Marge à terminaison d'un chantier : coût estimé à terminaison = coût réel ÷ avancement, lot par lot. */
export function marge(amount: number, lots: (typeof osSiteLot.$inferSelect)[]) {
  const bud = lots.reduce((a, l) => a + l.budget, 0);
  const cost = lots.reduce((a, l) => a + l.cost, 0);
  const av = bud ? lots.reduce((a, l) => a + (l.budget * l.progress) / 100, 0) / bud : 0;
  const eac = lots.reduce((a, l) => a + (l.progress > 0 ? l.cost / (l.progress / 100) : l.budget), 0);
  const m = amount - eac;
  return { bud, cost, av: av * 100, eac, m, pct: amount ? (m / amount) * 100 : 0 };
}
/** Lots types d'un nouveau chantier (budget = 85 % du marché, marge cible 15 %). */
export const DEFAULT_LOTS: [string, number][] = [['Installation de chantier', 0.05], ['Gros œuvre', 0.45], ['Second œuvre', 0.3], ['Finitions', 0.2]];

export const KAP_STEPS = ['recu', 'incomplet', 'preselectionne', 'diagnostic', 'en_preparation', 'revue_analyste', 'comite', 'pret_presentation', 'mis_en_relation', 'finance'] as const;
export const ACT_STAGES = ['Sensibilisation', 'Valorisation', "Pacte d'associés", "Recherche d'investisseurs", 'Opération réalisée'] as const;
export const TENDER_ST = ['Veille', 'En étude', 'Go', 'No-go', 'Déposé', 'Gagné', 'Perdu'] as const;
