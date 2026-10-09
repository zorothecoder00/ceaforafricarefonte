/* CEA OS — noyau du moteur de workflow et de validation (cahier des charges CEA OS, section 4 et annexe A), sans base de
   données : utilisable côté serveur, dans le navigateur (aperçu du circuit pendant la saisie) et dans les tests.
   - Workflow universel (WFL-01) : entrée → qualification → affectation → planification → production → contrôle → validation →
     exécution → mesure → clôture → capitalisation ; chaque type de dossier en utilise une partie, dans cet ordre.
   - Circuits V01 à V16 (WFL-03) : suite d'étapes « jeton d'approbateur + condition + délai », paramétrable en administration.
   - Seuils (WFL-04) : par type de dossier, pays et région ; le plus précis l'emporte (pays > région > toute l'organisation).
   - Acheminement automatique (WFL-14, règles de l'annexe A) : plusieurs pays → niveau régional ; plusieurs régions →
     Direction générale ; sujet stratégique → circuit renforcé (Direction générale puis Bureau panafricain). */

/** Étapes du workflow universel, dans l'ordre imposé. */
export const PHASES = ['entree', 'qualification', 'affectation', 'planification', 'production', 'controle', 'validation', 'execution', 'mesure', 'cloture', 'capitalisation'] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = {
  entree: 'Entrée', qualification: 'Qualification', affectation: 'Affectation', planification: 'Planification', production: 'Production', controle: 'Contrôle',
  validation: 'Validation', execution: 'Exécution', mesure: 'Mesure', cloture: 'Clôture', capitalisation: 'Capitalisation',
};

/** Jetons d'approbateur : qui valide une étape (résolus à partir du personnel, des organes et du périmètre du dossier). */
export const ROLE = {
  manager: 'Responsable hiérarchique', manager2: 'Responsable N+2', chef: 'Chef de département du domaine', pays: 'Représentant pays', reg: 'Directeur régional',
  dg: 'Direction générale', bp: 'Bureau panafricain', fin: 'Finance', rh: 'Ressources humaines', jur: 'Juridique', conf: 'Conformité et contrôle',
  com: 'Communication', it: 'Informatique et sécurité', ci: "Comité d'investissement", cs: 'Comité de sélection',
} as const;
export type Role = keyof typeof ROLE;
export const isRole = (x: unknown): x is Role => typeof x === 'string' && x in ROLE;

/** Conditions d'une étape (au moins une doit être vraie quand la liste n'est pas vide). */
export const COND = {
  'amount>pays': 'montant au-delà du seuil pays', 'amount>reg': 'montant au-delà du seuil régional', 'amount>dg': 'montant au-delà du seuil de la Direction générale',
  'amount>contrat': 'montant au-delà du seuil contrat', multi: 'plusieurs pays', multireg: 'plusieurs régions', strategic: 'sujet stratégique',
  sensitive: 'donnée confidentielle', risk: 'risque élevé', budget: 'avec budget', cadre: 'poste de cadre', agent: "poste d'agent",
} as const;
export type Cond = keyof typeof COND;

export type CircuitStep = { l: Role; if?: Cond[]; sla?: number }; // sla en heures
export type Circuit = { code: string; family: string; name: string; steps: CircuitStep[]; escalade: string; active: boolean; version: number; origin: 'referentiel' | 'propose' };
export type ChecklistItem = { k: string; label: string; critical: boolean };
export type ExecTask = { title: string; days: number };
export type WfType = {
  code: string; label: string; circuit: string; prefix: string; phases: Phase[]; checklist: ChecklistItem[];
  rejectTo: 'clos' | 'corrige'; exec: ExecTask[]; sla: number; dueDays: number; active: boolean; generic: boolean;
};
export type ThresholdKey = 'pays' | 'reg' | 'dg' | 'contrat';
export type ThresholdRow = { type: string; scope: string; key: ThresholdKey; amount: number };
export type Thresholds = Record<ThresholdKey, number>;

/** Contexte d'un dossier pour le calcul du circuit. */
export type Ctx = { amount: number; country: string; countries?: string[]; regionOf: (c: string) => string | null; strategic?: boolean; conf?: string; risk?: string; lvl?: 'agent' | 'cadre' };

/** Seuils applicables à un dossier : la valeur la plus précise par clé (pays, puis région, puis toute l'organisation), sinon la valeur par défaut. */
export function thresholdsFor(type: string, country: string, region: string | null, rows: ThresholdRow[], fallback: Thresholds): Thresholds {
  const out = { ...fallback };
  // Ordre de priorité : ce type puis tous les types (« * ») ; pour chacun, le pays, puis la région, puis toute l'organisation
  const scopes = [`p:${country}`, ...(region ? [`r:${region}`] : []), 'all'];
  for (const key of Object.keys(fallback) as ThresholdKey[]) {
    for (const t of [type, '*']) {
      const hit = scopes.map((sc) => rows.find((r) => r.key === key && r.scope === sc && r.type === t)).find(Boolean);
      if (hit) { out[key] = hit.amount; break; }
    }
  }
  return out;
}

const CONF_RANK: Record<string, number> = { Public: 0, Interne: 1, Confidentiel: 2, 'Strictement confidentiel': 3 };
export const sensitive = (conf?: string) => (CONF_RANK[conf ?? 'Interne'] ?? 1) >= 2;

/** Une condition est-elle remplie pour ce dossier ? */
export function holds(c: Cond, x: Ctx, thr: Thresholds): boolean {
  const cs = [...new Set([x.country, ...(x.countries ?? [])].filter(Boolean))];
  const regs = new Set(cs.map(x.regionOf).filter(Boolean));
  switch (c) {
    case 'amount>pays': return x.amount > thr.pays;
    case 'amount>reg': return x.amount > thr.reg;
    case 'amount>dg': return x.amount > thr.dg;
    case 'amount>contrat': return x.amount > thr.contrat;
    case 'multi': return cs.length > 1;
    case 'multireg': return regs.size > 1;
    case 'strategic': return !!x.strategic;
    case 'sensitive': return sensitive(x.conf);
    case 'risk': return x.risk === 'eleve' || x.risk === 'critique';
    case 'budget': return x.amount > 0;
    case 'cadre': return x.lvl === 'cadre';
    case 'agent': return x.lvl === 'agent';
  }
}

export type BuiltStep = { l: Role; sla: number; why?: string };
/** Étapes effectives d'un dossier : étapes du circuit dont la condition est remplie, puis acheminement automatique
   (plusieurs pays, plusieurs régions, sujet stratégique). Une même instance n'apparaît jamais deux fois de suite. */
export function buildSteps(c: Pick<Circuit, 'steps'>, x: Ctx, thr: Thresholds, defSla = 48): BuiltStep[] {
  const out: BuiltStep[] = [];
  for (const s of c.steps) {
    if (s.if?.length && !s.if.some((k) => holds(k, x, thr))) continue;
    out.push({ l: s.l, sla: s.sla ?? defSla, ...(s.if?.length ? { why: s.if.map((k) => COND[k]).join(' ou ') } : {}) });
  }
  const has = (l: Role) => out.some((s) => s.l === l);
  // Avant la dernière étape de contrôle (finance, RH, juridique) quand le circuit en a une, sinon à la fin
  const CONTROL: Role[] = ['fin', 'rh', 'jur', 'conf'];
  const insert = (l: Role, why: string) => {
    if (has(l)) return;
    let i = out.length;
    while (i > 0 && CONTROL.includes(out[i - 1].l)) i--;
    out.splice(i, 0, { l, sla: defSla, why });
  };
  if (holds('multi', x, thr) && !has('dg') && !has('bp')) insert('reg', 'acheminement automatique : plusieurs pays');
  if (holds('multireg', x, thr)) insert('dg', 'acheminement automatique : plusieurs régions');
  if (x.strategic) { insert('dg', 'circuit renforcé : sujet stratégique'); insert('bp', 'circuit renforcé : sujet stratégique'); }
  return out.filter((s, i) => i === 0 || s.l !== out[i - 1].l);
}

/** Libellé lisible d'un circuit : « Représentant pays → Directeur régional → Finance ». */
export const circuitLabel = (steps: { l: string }[]) => steps.map((s) => ROLE[s.l as Role] ?? s.l).join(' → ') || 'aucune validation';

/** Pièces critiques manquantes (WFL-05) : aucune soumission n'est acceptée sans elles. */
export const missingCritical = (list: ChecklistItem[], given: Record<string, unknown>) => list.filter((i) => i.critical && !given[i.k]);

/** Phase suivante autorisée (WFL-01 : l'ordre ne peut pas être contourné). */
export function nextPhase(type: Pick<WfType, 'phases'>, cur: string): Phase | null {
  const i = type.phases.indexOf(cur as Phase);
  return i >= 0 && i < type.phases.length - 1 ? type.phases[i + 1] : null;
}

/** Séparation des fonctions (WFL-11) : candidats d'une étape, sans le demandeur ni les personnes qui ont déjà validé une étape du même dossier. */
export function eligible(candidates: string[], requester: string, decidedBefore: string[]): string[] {
  return [...new Set(candidates)].filter((id) => id !== requester && !decidedBefore.includes(id));
}

/** Suivi des délais (WFL-08) : que faire pour une étape en retard ? rappel, puis escalade au responsable, puis au niveau supérieur. */
export type SlaAction = 'rien' | 'suspendre' | 'rappel' | 'escalade1' | 'escalade2';
export function slaAction(stepDue: Date | null, now: Date, reminded: number, suspended: boolean): SlaAction {
  if (!stepDue || now <= stepDue) return 'rien';
  if (suspended) return 'suspendre';
  const late = (now.getTime() - stepDue.getTime()) / 36e5;
  if (reminded <= 0) return 'rappel';
  if (reminded === 1 && late >= 24) return 'escalade1';
  if (reminded === 2 && late >= 48) return 'escalade2';
  return 'rien';
}
export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 36e5);

/* ===== Format texte des paramétrages (une ligne par élément, saisi dans Processus et seuils) ===== */
/** « fin | amount>pays, multi | 48 » ↔ { l: 'fin', if: ['amount>pays', 'multi'], sla: 48 }. */
export const stepsToText = (s: CircuitStep[]) => s.map((x) => [x.l, (x.if ?? []).join(', '), x.sla ?? ''].join(' | ')).join('\n');
export function parseStepsText(txt: string): CircuitStep[] | string {
  const out: CircuitStep[] = [];
  for (const [i, line] of txt.split('\n').map((l) => l.trim()).filter(Boolean).entries()) {
    const [l, conds = '', sla = ''] = line.split('|').map((x) => x.trim());
    if (!isRole(l)) return `Ligne ${i + 1} : approbateur « ${l} » inconnu.`;
    const cs = conds.split(',').map((x) => x.trim()).filter(Boolean);
    const bad = cs.find((x) => !(x in COND));
    if (bad) return `Ligne ${i + 1} : condition « ${bad} » inconnue.`;
    const h = sla ? Number(sla) : undefined;
    if (h !== undefined && (!Number.isInteger(h) || h < 1 || h > 2160)) return `Ligne ${i + 1} : délai en heures entre 1 et 2160.`;
    out.push({ l, ...(cs.length ? { if: cs as Cond[] } : {}), ...(h ? { sla: h } : {}) });
  }
  return out;
}
/** « note | Note conceptuelle | * » (★ critique) ↔ { k, label, critical }. */
export const checklistToText = (c: ChecklistItem[]) => c.map((x) => `${x.k} | ${x.label}${x.critical ? ' | *' : ''}`).join('\n');
export function parseChecklistText(txt: string): ChecklistItem[] | string {
  const out: ChecklistItem[] = [];
  for (const [i, line] of txt.split('\n').map((l) => l.trim()).filter(Boolean).entries()) {
    const [k, label = '', crit = ''] = line.split('|').map((x) => x.trim());
    if (!/^[a-z0-9_]{2,30}$/.test(k)) return `Ligne ${i + 1} : clé « ${k} » invalide (minuscules, chiffres, _).`;
    if (label.length < 2) return `Ligne ${i + 1} : libellé manquant.`;
    out.push({ k, label, critical: crit === '*' });
  }
  return out;
}
/** « Ouvrir les inscriptions | 7 » ↔ { title, days }. */
export const execToText = (e: ExecTask[]) => e.map((x) => `${x.title} | ${x.days}`).join('\n');
export function parseExecText(txt: string): ExecTask[] | string {
  const out: ExecTask[] = [];
  for (const [i, line] of txt.split('\n').map((l) => l.trim()).filter(Boolean).entries()) {
    const [title, d = '7'] = line.split('|').map((x) => x.trim());
    const days = Number(d);
    if (title.length < 2 || !Number.isInteger(days) || days < 0 || days > 365) return `Ligne ${i + 1} : « intitulé | nombre de jours » attendu.`;
    out.push({ title, days });
  }
  return out;
}
