/* Formulaires sans code (CDC §12) : champs, conditions d'affichage (« afficher si tel champ vaut … »), contrôle des réponses,
   règles de routage vers une équipe. Un champ masqué n'est jamais exigé et sa valeur éventuelle est ignorée. */
import { z } from 'zod';

const key = z.string().regex(/^[a-z0-9_]{1,30}$/, 'Identifiant : minuscules, chiffres et _');
export const FormField = z.object({
  key,
  label: z.string().trim().min(2).max(200),
  kind: z.enum(['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'radio', 'checkbox']),
  options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  required: z.boolean().default(false),
  help: z.string().trim().max(300).default(''),
  showIf: z.object({ field: key, equals: z.string().max(100) }).nullable().default(null),
});
export const FormFields = z.array(FormField).min(1, 'Au moins un champ').max(40)
  .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, 'Deux champs ont le même identifiant')
  // Une condition ne peut viser qu'un champ placé avant (pas de cycle)
  .refine((fs) => fs.every((f, i) => !f.showIf || fs.slice(0, i).some((x) => x.key === f.showIf!.field)), 'Une condition doit porter sur un champ placé plus haut');
export type FormField = z.infer<typeof FormField>;

export const Rule = z.object({ field: key, equals: z.string().max(100), team: z.string().trim().min(2).max(60), priority: z.enum(['basse', 'normale', 'haute', 'urgente']).default('normale') });
export const Rules = z.array(Rule).max(20);
export type Rule = z.infer<typeof Rule>;

export const TEAMS = ['Accueil', 'Adhésions', 'Programmes', 'Événements', 'Kapital Invest', 'Partenariats', 'Communication', 'Finance', 'Juridique'];

const valueOf = (v: unknown) => (Array.isArray(v) ? v.map(String) : v == null ? '' : String(v).trim());

/** Le champ est-il affiché, vu les réponses ? (une case à cocher vaut « oui » ou « non »). Un champ masqué masque ses dépendants. */
export function visible(fields: FormField[], data: Record<string, unknown>, f: FormField): boolean {
  if (!f.showIf) return true;
  const dep = fields.find((x) => x.key === f.showIf!.field);
  if (!dep || !visible(fields, data, dep)) return false;
  const v = data[dep.key];
  const val = dep.kind === 'checkbox' ? (v === true || v === 'on' || v === 'oui' ? 'oui' : 'non') : valueOf(v);
  return Array.isArray(val) ? val.includes(f.showIf.equals) : val === f.showIf.equals;
}

/** Contrôle des réponses : champs visibles requis, formats, choix existants. Renvoie les réponses retenues (champs visibles seulement). */
export function checkSubmission(fields: FormField[], data: Record<string, unknown>): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!visible(fields, data, f)) continue;
    if (f.kind === 'checkbox') { const on = data[f.key] === true || data[f.key] === 'on' || data[f.key] === 'oui'; if (f.required && !on) return { ok: false, error: `À cocher : ${f.label}` }; out[f.key] = on ? 'oui' : 'non'; continue; }
    const v = valueOf(data[f.key]);
    const s = Array.isArray(v) ? v.join(', ') : v;
    if (!s) { if (f.required) return { ok: false, error: `Champ requis : ${f.label}` }; continue; }
    if (s.length > (f.kind === 'textarea' ? 5000 : 300)) return { ok: false, error: `Réponse trop longue : ${f.label}` };
    if (f.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, error: `Adresse e-mail invalide : ${f.label}` };
    if (f.kind === 'tel' && !/^\+?[0-9 ().-]{6,20}$/.test(s)) return { ok: false, error: `Numéro invalide : ${f.label}` };
    if (f.kind === 'number' && !/^-?\d+([.,]\d+)?$/.test(s)) return { ok: false, error: `Nombre attendu : ${f.label}` };
    if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: `Date invalide : ${f.label}` };
    if ((f.kind === 'select' || f.kind === 'radio') && !f.options.includes(s)) return { ok: false, error: `Choix invalide : ${f.label}` };
    out[f.key] = s;
  }
  return { ok: true, data: out };
}

/** Équipe et priorité : première règle dont la condition est vérifiée, sinon l'équipe par défaut. */
export function route(rules: Rule[], data: Record<string, string>, defaultTeam: string) {
  const r = rules.find((x) => (data[x.field] ?? '') === x.equals);
  return { team: r?.team ?? defaultTeam, priority: r?.priority ?? 'normale' };
}

/** Coordonnées de la personne : premier champ e-mail renseigné, sinon premier téléphone. */
export const contactOf = (fields: FormField[], data: Record<string, string>) =>
  data[fields.find((f) => f.kind === 'email' && data[f.key])?.key ?? ''] ?? data[fields.find((f) => f.kind === 'tel' && data[f.key])?.key ?? ''] ?? '';
