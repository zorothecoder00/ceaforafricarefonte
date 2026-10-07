/* CEA OS — indicateurs de poste calculés en direct à partir des données (prototype › KF, KMAP) : jamais déclarés.
   Chaque poste du référentiel a ses indicateurs (KMAP) ; un indicateur dont le module n'est pas encore en service est ignoré.
   n : score sur 100 comparé à la cible (goal) pour la pastille verte / orange / rouge. */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { osRequest, osTask, osReviewItem } from '../../db/schema/os';
import { allOkrs, okrProg, currentReview } from './pilotage';
import { auditLog } from '../../db/schema/app';
import { kycCheck } from '../../db/schema/kapital';
import { pendingFor, budgets } from './approvals';
import type { Person } from './core';

export type Kpi = { k: string; l: string; v: string; n: number | null; goal?: number; sub?: string };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

const KLAB: Record<string, string> = {
  ins48: 'Inscriptions décidées sous 48 h', insPend: 'Inscriptions en attente', reports: 'Rapports mensuels soumis', myTasks: 'Tâches dans les délais',
  apprDelay: 'Approbations traitées sous 5 jours', apprPend: 'Approbations en attente', marge: 'Marge à terminaison moyenne', hse: 'Incidents QHSE ouverts',
  rappro: 'Encaissements rapprochés', cloture: 'Clôture mensuelle', budget: 'Budget engagé du périmètre', late: 'Factures du périmètre', emplois: 'Emplois vérifiés',
  kap: 'Dossiers Kapital', kyc: 'Vérifications KYC', evt: 'Marge des événements', cand: 'Candidatures évaluées', tickets: 'Tickets résolus', adoption: 'Adoption de CEA OS',
  okr: "Objectifs de l'organisation", contrats: 'Contrats à échéance', dup: 'Qualité des données', recrut: 'Recrutements en cours', rights: 'Revue des droits',
};
export const KMAP: Record<string, string[]> = {
  A1: ['okr', 'budget', 'late', 'adoption'], A2: ['myTasks'], A3: ['adoption', 'ins48', 'apprDelay'], A4: ['myTasks', 'okr'], A5: ['recrut', 'rights'], A6: ['contrats'],
  A7: ['rights', 'kyc'], B1: ['ins48', 'reports', 'insPend', 'budget'], B2: ['ins48', 'insPend', 'reports'], B3: ['ins48', 'insPend'], B4: ['myTasks'], C1: ['budget'],
  C2: ['kap', 'budget'], C3: ['kap'], C4: ['kyc'], C5: ['kap'], C6: ['budget'], C7: ['myTasks'], C8: ['evt', 'budget'], C9: ['evt'], C10: ['emplois'], C11: ['emplois'],
  C12: ['budget'], C14: ['cand', 'budget'], C15: ['cand'], C16: ['cand'], C17: ['budget'], C19: ['marge', 'hse', 'budget'], C20: ['marge'], C21: ['marge', 'hse'], C22: ['hse'],
  C24: ['emplois'], D1: ['cloture', 'rappro', 'late', 'budget'], D2: ['cloture'], D3: ['rappro', 'late'], D4: ['budget'], D5: ['budget'], D6: ['tickets'], D7: ['tickets'],
  D8: ['dup', 'adoption'], E1: ['adoption'], E11: ['rights'], F2: ['myTasks'], F3: ['contrats'],
};

type Ctx = { people: Person[] };
const KF: Record<string, (u: Person, c: Ctx) => Promise<Omit<Kpi, 'k' | 'l'> | null>> = {
  okr: async () => {
    const all = await allOkrs();
    const roots = all.filter((o) => !o.parentId);
    if (!roots.length) return null;
    const p = Math.round(roots.reduce((a, o) => a + okrProg(o, all), 0) / roots.length);
    return { v: p + ' %', n: p, goal: 70 };
  },
  rights: async (_u, c) => {
    const r = await currentReview();
    const tot = c.people.filter((s) => s.active).length;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osReviewItem).where(eq(osReviewItem.quarter, r.quarter));
    const p = pct(n, tot) ?? 0;
    return { v: p + ' %', n: p, goal: 100, sub: 'revue des droits ' + r.quarter };
  },
  myTasks: async (u) => {
    const l = await db.select({ due: osTask.due }).from(osTask).where(and(eq(osTask.owner, u.id), sql`${osTask.status} <> 'Terminé'`));
    const late = l.filter((t) => t.due < new Date()).length;
    const p = l.length ? Math.round(((l.length - late) / l.length) * 100) : 100;
    return { v: p + ' %', n: p, goal: 90, sub: late + ' en retard sur ' + l.length };
  },
  apprDelay: async (u) => {
    const rows = await db.select({ steps: osRequest.steps, at: osRequest.createdAt }).from(osRequest).where(sql`${osRequest.steps} @> ${JSON.stringify([{ whoId: u.id }])}::jsonb`);
    let n = 0, ok = 0;
    for (const r of rows) r.steps.forEach((s, i) => {
      if (s.whoId !== u.id || !s.at) return;
      n++;
      const prev = i ? r.steps[i - 1].at ?? r.at.toISOString() : r.at.toISOString();
      if ((new Date(s.at).getTime() - new Date(prev).getTime()) / 864e5 <= 5) ok++;
    });
    const p = pct(ok, n);
    return { v: p === null ? '—' : p + ' %', n: p, goal: 90, sub: n + ' décisions' };
  },
  apprPend: async (u, c) => { const n = (await pendingFor(u.id, { people: c.people })).length; return { v: String(n), n: n <= 5 ? 100 : Math.max(0, 100 - (n - 5) * 5), goal: 90, sub: 'à traiter' }; },
  budget: async (u) => {
    const b = await budgets();
    const scoped = ['chef', 'analyste', 'agent', 'cond'].includes(u.prof) && u.domain; // périmètre limité au domaine du poste
    const doms = Object.keys(b).filter((d) => !scoped || d === u.domain);
    const e = doms.reduce((a, d) => a + b[d].engaged, 0), t = doms.reduce((a, d) => a + b[d].budget, 0);
    if (!t) return null;
    const p = pct(e, t)!;
    return { v: p + ' % engagé', n: p <= 100 ? 100 : 0, goal: 100 };
  },
  adoption: async (_u, c) => {
    const withAccount = c.people.filter((s) => s.active && s.userId);
    if (!withAccount.length) return null;
    const act = await db.selectDistinct({ a: auditLog.actorId }).from(auditLog).where(and(gte(auditLog.at, new Date(Date.now() - 7 * 864e5)), inArray(auditLog.actorId, withAccount.map((s) => s.userId!))));
    const p = pct(act.length, withAccount.length)!;
    return { v: p + ' %', n: Math.min(100, Math.round((p / 85) * 100)), goal: 100, sub: 'utilisateurs actifs sur 7 jours' };
  },
  kyc: async () => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(kycCheck).where(eq(kycCheck.status, 'en_cours')).catch(() => [{ n: 0 }]);
    return { v: String(n), n: n ? Math.max(0, 100 - n * 20) : 100, goal: 90, sub: 'vérification(s) en attente' };
  },
};

export async function kpisOf(u: Person, people: Person[]): Promise<Kpi[]> {
  const keys = [...(KMAP[u.poste] ?? []), 'myTasks'];
  if (['dg', 'dirreg', 'rep', 'chef', 'fin', 'rh', 'jur'].includes(u.prof)) keys.push('apprDelay');
  else if ((await pendingFor(u.id, { people })).length) keys.push('apprDelay');
  const out: Kpi[] = [];
  for (const k of new Set(keys)) {
    const f = KF[k];
    const r = f ? await f(u, { people }).catch(() => null) : null;
    if (r) out.push({ k, l: KLAB[k] ?? k, ...r });
  }
  return out;
}
export const kpiState = (x: Kpi) => (x.n === null || x.n === undefined ? '' : x.n >= (x.goal ?? 90) ? 'ok' : x.n >= 60 ? 'warn' : 'bad');
