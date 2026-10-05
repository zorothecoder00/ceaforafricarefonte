/* Programmes et cohortes (CDC §12) : grilles d'évaluation pondérées, agrégation des notes de plusieurs jurys,
   état d'un appel, indicateurs de cohorte. */
import { z } from 'zod';

/* ----- Grille d'évaluation : critères notés de 0 à 5, pondérés (somme des poids = 100) ----- */
export const Criterion = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(2).max(80),
  weight: z.number().int().min(1).max(100),
  hint: z.string().trim().max(300).default(''),
});
export const Grid = z.array(Criterion).min(1, 'Au moins un critère').max(12)
  .refine((g) => g.reduce((n, c) => n + c.weight, 0) === 100, 'La somme des poids doit faire 100')
  .refine((g) => new Set(g.map((c) => c.key)).size === g.length, 'Deux critères ont le même identifiant');
export type Grid = z.infer<typeof Grid>;
export const SCALE = [0, 1, 2, 3, 4, 5] as const;
export const SCALE_LABEL = ['Absent', 'Très faible', 'Faible', 'Correct', 'Bon', 'Excellent'];

export const DEFAULT_GRID: Grid = [
  { key: 'probleme', label: 'Problème et marché', weight: 20, hint: 'Le problème est réel, documenté, le marché est accessible.' },
  { key: 'solution', label: 'Solution et différenciation', weight: 20, hint: 'La solution répond au problème et se distingue des alternatives.' },
  { key: 'equipe', label: 'Équipe', weight: 25, hint: 'Compétences complémentaires, engagement, capacité d’exécution.' },
  { key: 'traction', label: 'Traction', weight: 20, hint: 'Clients, revenus, partenariats, preuves d’usage.' },
  { key: 'impact', label: 'Impact', weight: 15, hint: 'Emplois, inclusion, environnement.' },
];

/** Total pondéré sur 100 d'une évaluation (notes 0 à 5) ; null si un critère n'est pas noté. */
export function weightedTotal(grid: Grid, scores: Record<string, number>) {
  let sum = 0;
  for (const c of grid) {
    const v = scores[c.key];
    if (typeof v !== 'number' || v < 0 || v > 5) return null;
    sum += (v / 5) * c.weight;
  }
  return Math.round(sum);
}

/** Agrégat des évaluations soumises (hors conflits d'intérêts) : moyenne, écart max-min, nombre, divergence forte. */
export function aggregate(evals: { total: number | null; conflict: boolean; submittedAt: Date | null }[], wanted: number) {
  const totals = evals.filter((e) => e.submittedAt && !e.conflict && e.total !== null).map((e) => e.total!);
  const n = totals.length;
  const mean = n ? Math.round(totals.reduce((a, b) => a + b, 0) / n) : null;
  const spread = n > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
  return { n, wanted, complete: n >= wanted, mean, spread, divergent: spread >= 25 };
}

/* ----- Formulaire de candidature d'un appel ----- */
export const Field = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(2).max(200),
  kind: z.enum(['text', 'textarea', 'number', 'select']),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  required: z.boolean().default(true),
});
export const Fields = z.array(Field).max(30);
export type Fields = z.infer<typeof Fields>;
export const DEFAULT_FIELDS: Fields = [
  { key: 'entreprise', label: "Nom de l'entreprise ou du projet", kind: 'text', options: [], required: true },
  { key: 'secteur', label: 'Secteur', kind: 'select', options: ['Agriculture et agro-industrie', 'Numérique et fintech', 'Commerce et services', 'Industrie, énergie, BTP', 'Santé', 'Éducation', 'Autre'], required: true },
  { key: 'probleme', label: 'Quel problème résolvez-vous, et pour qui ?', kind: 'textarea', options: [], required: true },
  { key: 'traction', label: 'Où en êtes-vous (clients, chiffre d’affaires, équipe) ?', kind: 'textarea', options: [], required: true },
  { key: 'attentes', label: "Qu'attendez-vous du programme ?", kind: 'textarea', options: [], required: false },
];

/** Réponses valides au formulaire d'un appel (champs requis présents, longueurs bornées, choix existants). */
export function checkAnswers(fields: Fields, data: Record<string, unknown>): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = String(data[f.key] ?? '').trim();
    if (!v) { if (f.required) return { ok: false, error: `Champ requis : ${f.label}` }; continue; }
    if (v.length > (f.kind === 'textarea' ? 5000 : 300)) return { ok: false, error: `Réponse trop longue : ${f.label}` };
    if (f.kind === 'number' && !/^\d+([.,]\d+)?$/.test(v)) return { ok: false, error: `Nombre attendu : ${f.label}` };
    if (f.kind === 'select' && !f.options.includes(v)) return { ok: false, error: `Choix invalide : ${f.label}` };
    out[f.key] = v;
  }
  return { ok: true, data: out };
}

/* ----- État d'un appel ----- */
export type CallState = 'brouillon' | 'a_venir' | 'ouvert' | 'clos' | 'archive';
export function callState(c: { status: string; opensAt: Date | null; closesAt: Date | null }, now = new Date()): CallState {
  if (c.status === 'brouillon' || c.status === 'archive') return c.status;
  if (c.status === 'clos' || (c.closesAt && c.closesAt < now)) return 'clos';
  if (c.opensAt && c.opensAt > now) return 'a_venir';
  return 'ouvert';
}
export const CALL_STATE_LABEL: Record<CallState, string> = { brouillon: 'Brouillon', a_venir: 'Ouverture prochaine', ouvert: 'Ouvert', clos: 'Clos', archive: 'Archivé' };

/* ----- Indicateurs de cohorte ----- */
export const rate = (num: number, den: number) => (den ? Math.round((num / den) * 100) : null);
export const MEMBER_STATUS_LABEL = { actif: 'Actif', abandon: 'Abandon', diplome: 'Diplômé' } as const;
export const MILESTONE_LABEL = { a_faire: 'À faire', declare: 'Déclaré (à valider)', atteint: 'Atteint', non_atteint: 'Non atteint' } as const;
export const SESSION_KIND_LABEL: Record<string, string> = { atelier: 'Atelier', mentorat: 'Mentorat', demo_day: 'Demo Day', visite: 'Visite', autre: 'Autre' };
