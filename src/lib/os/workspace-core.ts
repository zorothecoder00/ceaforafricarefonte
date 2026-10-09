/* CEA OS — poste de travail (cahier des charges CEA OS, 5.1 et 5.4), calculs sans base de données, testés :
   score de priorité quotidien (ESP-01), plan du jour à partir des réunions, créneaux et tâches (ESP-03), conflits d'agenda
   (ESP-02), charge et capacité (ESP-04), récurrence des missions (ESP-05, AUT-04), périodes et progression des objectifs
   (ESP-06), comparaison de deux versions d'un texte (DOC-02), remplissage d'un modèle (DOC-01). Heures en temps universel
   (heure de Lomé). */

export type Prio = 'urgente' | 'haute' | 'normale' | 'basse';
export const PRIO_LABEL: Record<Prio, string> = { urgente: 'Urgente', haute: 'Haute', normale: 'Normale', basse: 'Basse' };
const DAY = 864e5;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Score de priorité d'une tâche (0 à 100) : retard, échéance proche, priorité déclarée, travail déjà commencé. */
export function priorityScore(t: { due: Date; priority?: string | null; status?: string }, now = new Date()): number {
  const days = Math.floor((startOfDay(t.due).getTime() - startOfDay(now).getTime()) / DAY);
  let s = days < 0 ? 55 + Math.min(20, -days * 5) : days === 0 ? 40 : days === 1 ? 25 : days <= 7 ? 12 : 0;
  s += t.priority === 'urgente' ? 30 : t.priority === 'haute' ? 15 : t.priority === 'basse' ? -10 : 0;
  if (t.status === 'En cours') s += 5;
  return Math.max(0, Math.min(100, s));
}

export type Slot = { start: Date; end: Date; title: string; kind: string; ref?: string; fixed: boolean };
/** Plan du jour : les rendez-vous fixes (réunions, créneaux d'agenda) restent en place ; les tâches remplissent les trous
   entre `from` et `to` heures, par score décroissant, par tranches d'une demi-heure. Les tâches qui ne tiennent pas sont reportées. */
export function dayPlan(day: Date, fixed: Omit<Slot, 'fixed'>[], tasks: { id: string; title: string; estimate: number; score: number }[], from = 8, to = 17) {
  const d0 = startOfDay(day).getTime();
  const open = d0 + from * 36e5, close = d0 + to * 36e5;
  const busy = fixed.filter((f) => f.end.getTime() > open && f.start.getTime() < close).map((f) => ({ ...f, fixed: true }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const gaps: [number, number][] = [];
  let cur = open;
  for (const b of busy) { if (b.start.getTime() > cur) gaps.push([cur, b.start.getTime()]); cur = Math.max(cur, b.end.getTime()); }
  if (cur < close) gaps.push([cur, close]);
  const placed: Slot[] = [], later: typeof tasks = [];
  for (const t of [...tasks].sort((a, b) => b.score - a.score)) {
    const need = Math.max(0.5, Math.ceil(t.estimate * 2) / 2) * 36e5;
    const g = gaps.find(([a, b]) => b - a >= need);
    if (!g) { later.push(t); continue; }
    placed.push({ start: new Date(g[0]), end: new Date(g[0] + need), title: t.title, kind: 'tache', ref: t.id, fixed: false });
    g[0] += need;
  }
  return { slots: [...busy, ...placed].sort((a, b) => a.start.getTime() - b.start.getTime()), later, free: gaps.reduce((n, [a, b]) => n + (b - a), 0) / 36e5 };
}

/** Conflits d'agenda : paires d'éléments qui se chevauchent (ESP-02). */
export function conflicts<T extends { start: Date; end: Date }>(items: T[]): [T, T][] {
  const s = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: [T, T][] = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length && s[j].start < s[i].end; j++) out.push([s[i], s[j]]);
  return out;
}

/** Charge d'une semaine (ESP-04) : heures prévues (tâches ouvertes à échéance dans la semaine, réunions, créneaux) face à la
   capacité (heures contractuelles moins les congés) ; réel = heures déclarées dans la feuille de temps. */
export function weekLoad(o: { taskHours: number; meetingHours: number; blockHours: number; leaveDays: number; realHours: number; weekHours?: number }) {
  const capacity = Math.max(0, (o.weekHours ?? 40) - o.leaveDays * 8);
  const planned = o.taskHours + o.meetingHours + o.blockHours;
  const ratio = capacity ? planned / capacity : planned > 0 ? 9 : 0;
  return { planned, capacity, real: o.realHours, ratio, level: ratio > 1.1 ? 'surcharge' : ratio > 0.9 ? 'pleine' : ratio < 0.5 ? 'disponible' : 'normale' } as const;
}

/** Une mission récurrente doit-elle produire sa tâche ce jour-là ? jour = jours ouvrés ; semaine:1 (lundi) à semaine:7 ; mois:1 à mois:28. */
export function recurrenceDue(rec: string | null | undefined, d: Date): boolean {
  if (!rec) return false;
  const dow = d.getUTCDay() || 7; // 1 = lundi … 7 = dimanche
  if (rec === 'jour') return dow <= 5;
  const [k, n] = rec.split(':');
  if (k === 'semaine') return dow === Number(n);
  if (k === 'mois') return d.getUTCDate() === Number(n);
  return false;
}
export const RECURRENCE_LABEL = (rec: string | null | undefined) => {
  if (!rec) return 'Sans tâche récurrente';
  if (rec === 'jour') return 'Chaque jour ouvré';
  const [k, n] = rec.split(':');
  if (k === 'semaine') return 'Chaque ' + ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][Number(n) - 1];
  return `Le ${n} de chaque mois`;
};

/** Clé de période d'un objectif : 2026-S41, 2026-10, 2026-T4. */
export function periodKey(period: 'semaine' | 'mois' | 'trimestre', d = new Date()): string {
  const y = d.getUTCFullYear();
  if (period === 'mois') return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (period === 'trimestre') return `${y}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
  const t = startOfDay(d);
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-S${Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7)}`;
}
/** Progression d'un objectif (%) : part des tâches rattachées terminées quand il y en a, sinon valeur atteinte / cible. */
export function objectiveProgress(o: { target: number; current: number }, linked?: { done: number; total: number }): number {
  if (linked && linked.total > 0) return Math.round((linked.done / linked.total) * 100);
  return o.target > 0 ? Math.max(0, Math.min(100, Math.round((o.current / o.target) * 100))) : 0;
}

/** Comparaison ligne à ligne de deux versions d'un texte (plus longue sous-suite commune). */
export type DiffLine = { op: '=' | '+' | '-'; text: string };
export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split('\n'), B = b.split('\n');
  if (A.length * B.length > 4e6) return [...A.map((text) => ({ op: '-' as const, text })), ...B.map((text) => ({ op: '+' as const, text }))];
  const L = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push({ op: '=', text: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: A[i++] });
    else out.push({ op: '+', text: B[j++] });
  }
  while (i < A.length) out.push({ op: '-', text: A[i++] });
  while (j < B.length) out.push({ op: '+', text: B[j++] });
  return out;
}

/** Modèle de document : {{variable}} remplacée ; une variable inconnue est laissée visible pour être complétée. */
export const fillTemplate = (body: string, vars: Record<string, string>) => body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m);
