/* Studio de capital (CDC §7.5) : table de capitalisation tenue par opérations, BSPCE avec acquisition progressive,
   scénarios de levée comparés (dilution, prix par action, réserve BSPCE, répartition d'une sortie avec préférences de
   liquidation non participatives, simplifiée). Calculs purs, utilisés par le serveur (validation) et le navigateur (éditeur).
   Outil pédagogique : il ne remplace ni le registre des mouvements de titres ni un conseil juridique. */
import { z } from 'zod';

const id = z.string().min(1).max(40);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ');
const n = (max: number) => z.number().min(0).max(max);
const int = (max: number) => z.number().int().min(0).max(max);

export const ShareClass = z.object({ id, name: z.string().trim().min(1).max(60), kind: z.enum(['ordinaire', 'preference']), multiple: n(5) });
export const Holder = z.object({ id, name: z.string().trim().min(1).max(80), kind: z.enum(['fondateur', 'investisseur', 'salarie', 'autre']) });
export const Op = z.discriminatedUnion('t', [
  z.object({ t: z.literal('emission'), date: day, holder: id, cls: id, shares: int(1e12), price: n(1e12) }),
  z.object({ t: z.literal('cession'), date: day, from: id, to: id, cls: id, shares: int(1e12), price: n(1e12) }),
  z.object({ t: z.literal('reserve'), date: day, options: int(1e12) }),
  z.object({ t: z.literal('bspce'), date: day, holder: id, options: int(1e12), strike: n(1e12), vesting: int(120), cliff: int(48) }),
  z.object({ t: z.literal('exercice'), date: day, holder: id, options: int(1e12) }),
]);
export const Scenario = z.object({ id, name: z.string().trim().min(1).max(60), preMoney: n(1e15), raise: n(1e15), poolPct: n(30), multiple: n(5), exit: n(1e16) });
export const Model = z.object({
  classes: z.array(ShareClass).min(1).max(10), holders: z.array(Holder).max(200), ops: z.array(Op).max(2000), scenarios: z.array(Scenario).max(3),
});
export type ShareClass = z.infer<typeof ShareClass>; export type Holder = z.infer<typeof Holder>; export type Op = z.infer<typeof Op>;
export type Scenario = z.infer<typeof Scenario>; export type Model = z.infer<typeof Model>;

export const emptyModel = (): Model => ({
  classes: [{ id: 'ord', name: 'Actions ordinaires', kind: 'ordinaire', multiple: 0 }],
  holders: [], ops: [], scenarios: [],
});

/** Actions acquises (vested) d'une attribution à une date : rien avant la falaise, puis linéaire mensuel. */
export function vested(g: { date: string; options: number; vesting: number; cliff: number }, at: string) {
  if (!g.vesting) return g.options;
  const [y0, m0, d0] = g.date.split('-').map(Number), [y1, m1, d1] = at.split('-').map(Number);
  const months = (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0);
  if (months < g.cliff) return 0;
  return Math.min(g.options, Math.floor((g.options * months) / g.vesting));
}

export type Row = { holder: Holder; byClass: Record<string, number>; shares: number; options: number; vestedOptions: number; pctIssued: number; pctFD: number; invested: number };
export type Table = {
  rows: Row[]; issued: number; byClass: Record<string, number>; pool: number; granted: number; unallocated: number; outstanding: number; fd: number;
  investedByClass: Record<string, number>; errors: string[]; history: { op: Op; label: string; issuedAfter: number }[];
};

const fmt = (x: number) => Math.round(x).toLocaleString('fr-FR');

/** Calcule la table à une date (opérations postérieures ignorées). */
export function computeTable(m: Model, at = new Date().toISOString().slice(0, 10)): Table {
  const name = (hid: string) => m.holders.find((h) => h.id === hid)?.name ?? '?';
  const cname = (cid: string) => m.classes.find((c) => c.id === cid)?.name ?? '?';
  const ordinary = m.classes.find((c) => c.kind === 'ordinaire')?.id ?? m.classes[0].id;
  const hold: Record<string, Record<string, number>> = {};
  const invested: Record<string, number> = {}, investedByClass: Record<string, number> = {};
  const grants: Record<string, { date: string; options: number; vesting: number; cliff: number }[]> = {};
  const exercised: Record<string, number> = {};
  const errors: string[] = [], history: Table['history'] = [];
  let pool = 0, issued = 0;
  const add = (h: string, c: string, k: number) => { hold[h] ??= {}; hold[h][c] = (hold[h][c] ?? 0) + k; };
  const ops = m.ops.map((op, i) => ({ op, i })).filter(({ op }) => op.date <= at).sort((a, b) => a.op.date.localeCompare(b.op.date) || a.i - b.i);
  for (const { op } of ops) {
    let label = '';
    if (op.t === 'emission') {
      add(op.holder, op.cls, op.shares); issued += op.shares;
      invested[op.holder] = (invested[op.holder] ?? 0) + op.shares * op.price;
      investedByClass[op.cls] = (investedByClass[op.cls] ?? 0) + op.shares * op.price;
      label = `Émission de ${fmt(op.shares)} ${cname(op.cls).toLowerCase()} à ${name(op.holder)} (${fmt(op.price)} FCFA l'action)`;
    } else if (op.t === 'cession') {
      const have = hold[op.from]?.[op.cls] ?? 0;
      if (have < op.shares) errors.push(`${op.date} : ${name(op.from)} cède ${fmt(op.shares)} actions mais n'en détient que ${fmt(have)}.`);
      add(op.from, op.cls, -Math.min(have, op.shares)); add(op.to, op.cls, Math.min(have, op.shares));
      label = `Cession de ${fmt(op.shares)} ${cname(op.cls).toLowerCase()} de ${name(op.from)} à ${name(op.to)}`;
    } else if (op.t === 'reserve') {
      pool += op.options;
      label = `Réserve de BSPCE portée à ${fmt(pool)} bons`;
    } else if (op.t === 'bspce') {
      (grants[op.holder] ??= []).push(op);
      label = `Attribution de ${fmt(op.options)} BSPCE à ${name(op.holder)} (prix d'exercice ${fmt(op.strike)} FCFA, acquisition ${op.vesting} mois dont ${op.cliff} de falaise)`;
    } else {
      const v = (grants[op.holder] ?? []).reduce((a, g) => a + vested(g, op.date), 0) - (exercised[op.holder] ?? 0);
      if (v < op.options) errors.push(`${op.date} : ${name(op.holder)} exerce ${fmt(op.options)} BSPCE mais seuls ${fmt(Math.max(0, v))} sont acquis.`);
      const k = Math.max(0, Math.min(v, op.options));
      exercised[op.holder] = (exercised[op.holder] ?? 0) + k;
      add(op.holder, ordinary, k); issued += k;
      label = `Exercice de ${fmt(op.options)} BSPCE par ${name(op.holder)}`;
    }
    history.push({ op, label, issuedAfter: issued });
  }
  const granted = Object.values(grants).flat().reduce((a, g) => a + g.options, 0);
  if (granted > pool) errors.push(`Les BSPCE attribués (${fmt(granted)}) dépassent la réserve (${fmt(pool)}).`);
  const totalExercised = Object.values(exercised).reduce((a, b) => a + b, 0);
  const outstanding = granted - totalExercised;
  const unallocated = Math.max(0, pool - granted);
  const fd = issued + outstanding + unallocated;
  const byClass: Record<string, number> = {};
  const rows = m.holders.map((h) => {
    const bc = hold[h.id] ?? {};
    for (const [c, k] of Object.entries(bc)) byClass[c] = (byClass[c] ?? 0) + k;
    const shares = Object.values(bc).reduce((a, b) => a + b, 0);
    const opts = (grants[h.id] ?? []).reduce((a, g) => a + g.options, 0) - (exercised[h.id] ?? 0);
    const vest = Math.max(0, (grants[h.id] ?? []).reduce((a, g) => a + vested(g, at), 0) - (exercised[h.id] ?? 0));
    return { holder: h, byClass: bc, shares, options: opts, vestedOptions: Math.min(vest, opts), pctIssued: issued ? shares / issued : 0, pctFD: fd ? (shares + opts) / fd : 0, invested: invested[h.id] ?? 0 };
  });
  return { rows, issued, byClass, pool, granted, unallocated, outstanding, fd, investedByClass, errors, history };
}

export type Line = { name: string; before: number; after: number; exit: number };
export type ScenarioResult = { s: Scenario; price: number; newShares: number; poolTopUp: number; fdAfter: number; postMoney: number; lines: Line[]; error?: string };

/** Scénario de levée : réserve complétée avant l'entrée de l'investisseur (pool pré-money) pour atteindre poolPct du capital
    totalement dilué après opération ; sortie à `exit` avec préférences non participatives (multiple × montant investi). */
export function runScenario(m: Model, t: Table, s: Scenario): ScenarioResult {
  const base = { s, price: 0, newShares: 0, poolTopUp: 0, fdAfter: t.fd, postMoney: s.preMoney + s.raise, lines: [] as Line[] };
  if (!t.fd || !s.preMoney) return { ...base, error: 'Renseignez la table et la valorisation avant levée.' };
  const r = s.raise / s.preMoney, target = s.poolPct / 100;
  if (target * (1 + r) >= 1) return { ...base, error: 'Réserve demandée trop élevée pour cette levée.' };
  const P = Math.max(0, Math.ceil((target * (1 + r) * t.fd - t.unallocated) / (1 - target * (1 + r))));
  const price = s.preMoney / (t.fd + P);
  const N = price ? Math.round(s.raise / price) : 0;
  const fdAfter = t.fd + P + N;
  // Participants à une sortie : actions et BSPCE en circulation (exercés par hypothèse) ; la réserve non attribuée n'est pas servie
  type Part = { key: string; shares: number; pref: number };
  const parts: Part[] = [];
  for (const row of t.rows) {
    for (const [c, k] of Object.entries(row.byClass)) {
      const cls = m.classes.find((x) => x.id === c);
      const prefShare = cls?.kind === 'preference' && t.byClass[c] ? (t.investedByClass[c] ?? 0) * cls.multiple * (k / t.byClass[c]) : 0;
      if (k > 0) parts.push({ key: row.holder.id, shares: k, pref: prefShare });
    }
    if (row.options > 0) parts.push({ key: row.holder.id, shares: row.options, pref: 0 });
  }
  parts.push({ key: '__new', shares: N, pref: s.raise * s.multiple });
  const value = waterfall(parts, s.exit);
  const val = (key: string) => parts.reduce((a, p, i) => a + (p.key === key ? value[i] : 0), 0);
  const lines: Line[] = t.rows.map((row) => ({ name: row.holder.name, before: row.pctFD, after: (row.shares + row.options) / fdAfter, exit: val(row.holder.id) }));
  lines.push({ name: `Investisseur — ${s.name}`, before: 0, after: N / fdAfter, exit: val('__new') });
  lines.push({ name: 'Réserve BSPCE non attribuée', before: t.unallocated / t.fd, after: (t.unallocated + P) / fdAfter, exit: 0 });
  return { s, price, newShares: N, poolTopUp: P, fdAfter, postMoney: s.preMoney + s.raise, lines };
}

/** Répartition d'une sortie : chaque bloc privilégié choisit le plus favorable entre sa préférence et la conversion. */
export function waterfall(parts: { shares: number; pref: number }[], exit: number): number[] {
  let convert = parts.map(() => true);
  for (let it = 0; it < 10; it++) {
    const prefTotal = parts.reduce((a, p, i) => a + (convert[i] ? 0 : p.pref), 0);
    const prefPaid = Math.min(exit, prefTotal);
    const rest = exit - prefPaid;
    const convShares = parts.reduce((a, p, i) => a + (convert[i] ? p.shares : 0), 0);
    const pps = convShares ? rest / convShares : 0;
    const next = parts.map((p) => !(p.pref > 0 && p.pref > p.shares * pps));
    if (next.every((v, i) => v === convert[i])) {
      return parts.map((p, i) => (convert[i] ? p.shares * pps : prefTotal ? (p.pref / prefTotal) * prefPaid : 0));
    }
    convert = next;
  }
  const total = parts.reduce((a, p) => a + p.shares, 0);
  return parts.map((p) => (total ? (p.shares / total) * exit : 0));
}
