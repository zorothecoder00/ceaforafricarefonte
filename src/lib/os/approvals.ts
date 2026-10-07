/* CEA OS — moteur d'approbation (prototype CEA OS).
   Circuits : dépense = représentant pays → (directeur régional au-delà du seuil pays) → (Direction générale au-delà du seuil
   régional) → finance ; note de frais = responsable → finance ; congé = responsable → RH ; achat = responsable → (DG au-delà
   du seuil régional) → finance ; contrat = juridique → (DG au-delà du seuil contrat) ; recrutement = région (agents) ou DG
   (cadres) → RH ; offre hors fourchette = DG.
   Un demandeur ne valide jamais sa propre demande : l'étape passe automatiquement. Les délégations de signature actives
   ajoutent le délégataire aux approbateurs. Chaque décision est notifiée et journalisée. */
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { osRequest, osDelegation, osBudget, staff, type Step } from '../../db/schema/os';
import { getSetting } from '../settings';
import { notify } from '../notify';
import { audit } from '../session';
import { allStaff, type Person } from './core';
import { LVL, RTYPE, RPREFIX, regOf, type Level, type ReqType } from './ref';

export type Req = typeof osRequest.$inferSelect;
export type Thresholds = { pays: number; reg: number; contrat: number };
export const thresholds = () => getSetting('seuils') as Promise<Thresholds>;

/** Étapes du circuit selon le type et le montant (ou, pour un recrutement, le niveau « agent » / « cadre »). */
export function makeSteps(type: ReqType, amt: number | string, thr: Thresholds): Step[] {
  const s: Level[] = [];
  const a = typeof amt === 'number' ? amt : 0;
  if (type === 'dep') { s.push('pays'); if (a > thr.pays) s.push('reg'); if (a > thr.reg) s.push('dg'); s.push('fin'); }
  if (type === 'ndf') s.push('manager', 'fin');
  if (type === 'conge') s.push('manager', 'rh');
  if (type === 'achat') { s.push('manager'); if (a > thr.reg) s.push('dg'); s.push('fin'); }
  if (type === 'contrat') { s.push('jur'); if (a > thr.contrat) s.push('dg'); }
  if (type === 'recrut') { s.push(amt === 'agent' ? 'reg' : 'dg'); s.push('rh'); }
  if (type === 'offre') s.push('dg');
  return s.map((l) => ({ l, st: 'attente' }));
}
export const circuit = (steps: { l: string }[]) => steps.map((s) => LVL[s.l as Level] ?? s.l).join(' → ');

type Deleg = typeof osDelegation.$inferSelect;
export async function activeDelegations(): Promise<Deleg[]> {
  const now = new Date();
  return db.select().from(osDelegation).where(and(eq(osDelegation.revoked, false), gt(osDelegation.until, now), lte(osDelegation.start, now)));
}

/** Approbateurs « titulaires » d'un niveau pour une demande. */
function rawApprovers(l: string, r: Pick<Req, 'byStaff' | 'country'>, people: Person[]): string[] {
  const by = people.find((s) => s.id === r.byStaff);
  const act = (s?: Person) => !!s && s.active && !s.suspended;
  const dg = () => people.filter((s) => s.prof === 'dg' && act(s)).map((s) => s.id);
  if (l === 'manager') {
    const m = people.find((s) => s.id === by?.managerId);
    if (act(m)) return [m!.id];
    const mm = m && people.find((s) => s.id === m.managerId);
    if (act(mm)) return [mm!.id];
    return dg();
  }
  let out: string[] = [];
  if (l === 'pays') out = people.filter((s) => s.prof === 'rep' && s.country === r.country && act(s)).map((s) => s.id);
  else if (l === 'reg') out = people.filter((s) => s.prof === 'dirreg' && s.reg === regOf(r.country) && act(s)).map((s) => s.id);
  else if (l === 'fin') out = people.filter((s) => s.prof === 'fin' && s.poste !== 'D5' && act(s)).map((s) => s.id); // l'acheteur (D5) ne valide pas les paiements
  else out = people.filter((s) => s.prof === l && act(s)).map((s) => s.id);
  if (!out.length && l === 'pays') return rawApprovers('reg', r, people);
  return out.length ? out : dg();
}
export function approverOf(l: string, r: Pick<Req, 'byStaff' | 'country'>, people: Person[], delegs: Deleg[]): string[] {
  const base = rawApprovers(l, r, people);
  const out = [...base];
  for (const id of base) for (const d of delegs) if (d.fromStaff === id && !out.includes(d.toStaff)) out.push(d.toStaff);
  return out;
}
export const isApprover = (l: string, r: Req, meId: string, people: Person[], delegs: Deleg[]) => meId !== r.byStaff && approverOf(l, r, people, delegs).includes(meId);

/** Étapes que seul le demandeur pourrait valider : validées automatiquement (il ne valide jamais sa propre demande). Renvoie l'étape en cours. */
function skipSelf(steps: Step[], cur: number, r: Pick<Req, 'byStaff' | 'country'>, people: Person[], delegs: Deleg[]): number {
  while (cur < steps.length && approverOf(steps[cur].l, r, people, delegs).every((id) => id === r.byStaff)) {
    steps[cur] = { ...steps[cur], st: 'ok', who: 'Escalade automatique (le demandeur ne valide pas sa propre demande)', at: new Date().toISOString() };
    cur++;
  }
  return cur;
}

/** Notifie des collaborateurs (ceux qui ont un compte). */
export async function notifyStaff(ids: string[], title: string, link: string, people?: Person[]) {
  const ps = people ?? await allStaff();
  for (const id of new Set(ids)) {
    const u = ps.find((s) => s.id === id)?.userId;
    if (u) await notify(u, title, link).catch(() => {});
  }
}
const label = (r: Pick<Req, 'type' | 'id' | 'title'>) => `${RTYPE[r.type as ReqType] ?? r.type} ${r.id} — ${r.title}`;

async function notifyStep(r: Req, people: Person[], delegs: Deleg[]) {
  const s = r.steps[r.cur];
  if (!s) return;
  await notifyStaff(approverOf(s.l, r, people, delegs), `À approuver : ${label(r)}`, '/admin/approbations', people);
}

/** Engagement budgétaire du domaine pour l'année en cours (dépenses et achats). */
export async function engageBudget(domain: string | null | undefined, amt: number, col: 'engaged' | 'realised' = 'engaged') {
  if (!domain || !amt) return;
  const year = new Date().getFullYear();
  await db.insert(osBudget).values({ year, domain, [col]: amt }).onConflictDoUpdate({ target: [osBudget.year, osBudget.domain], set: { [col]: sql`${osBudget[col]} + ${amt}`, updatedAt: new Date() } });
}

export type NewReq = { title: string; amount?: number; country?: string; domain?: string | null; data?: Record<string, unknown>; lvl?: 'agent' | 'cadre' };
/** Crée une demande, saute les étapes que le demandeur devrait valider lui-même, notifie le premier approbateur. */
export async function createRequest(me: Person, type: ReqType, o: NewReq): Promise<Req> {
  const [people, delegs, thr] = await Promise.all([allStaff(), activeDelegations(), thresholds()]);
  const amount = Math.round(o.amount ?? 0);
  const steps = makeSteps(type, type === 'recrut' ? (o.lvl ?? 'cadre') : amount, thr);
  const base = { byStaff: me.id, country: o.country ?? me.country };
  const cur = skipSelf(steps, 0, base, people, delegs);
  let row: Req | undefined;
  for (let i = 0; i < 4 && !row; i++) {
    const id = RPREFIX[type] + randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
    [row] = await db.insert(osRequest).values({
      id, type, title: o.title, amount, country: base.country, domain: o.domain ?? me.domain ?? 'prj', byStaff: me.id, data: { ...(o.data ?? {}), ...(o.lvl ? { lvl: o.lvl } : {}) },
      steps, cur, status: 'En approbation',
    }).onConflictDoNothing().returning();
  }
  if (!row) throw new Error('Référence de demande indisponible, réessayez.');
  if (cur >= steps.length) await finalize(row, people);
  else await notifyStep(row, people, delegs);
  await audit(me.userId, 'os.demande.creation', row.id, { type, amount, circuit: circuit(steps) });
  return row;
}

/** Éléments qui attendent la décision d'un collaborateur. */
export type Pending = { r: Req; lvl: string };
export async function pendingFor(meId: string | null | undefined, ctx?: { people?: Person[]; delegs?: Deleg[] }): Promise<Pending[]> {
  if (!meId) return [];
  const [people, delegs, reqs] = await Promise.all([ctx?.people ?? allStaff(), ctx?.delegs ?? activeDelegations(), db.select().from(osRequest).where(eq(osRequest.status, 'En approbation')).orderBy(desc(osRequest.createdAt))]);
  return reqs.flatMap((r) => { const s = r.steps[r.cur]; return s && isApprover(s.l, r, meId, people, delegs) ? [{ r, lvl: LVL[s.l as Level] ?? s.l }] : []; });
}

/** Décision sur l'étape en cours d'une demande. */
export async function decide(id: string, me: Person, ok: boolean, com = ''): Promise<string | null> {
  const [people, delegs, [r]] = await Promise.all([allStaff(), activeDelegations(), db.select().from(osRequest).where(eq(osRequest.id, id))]);
  if (!r || r.status !== 'En approbation') return 'Cette demande n’est plus en attente.';
  const s = r.steps[r.cur];
  if (!s || !isApprover(s.l, r, me.id, people, delegs)) return 'Vous n’êtes pas approbateur de cette étape.';
  if (!ok && !com.trim()) return 'Indiquez le motif du rejet.';
  const now = new Date().toISOString();
  const steps = r.steps.map((x, i) => (i === r.cur ? { ...x, st: ok ? 'ok' : 'rejet', who: me.name, whoId: me.id, at: now, com } as Step : x));
  const hist = [...r.hist, [now, me.name, (ok ? 'Approuvé' : 'Rejeté') + ' — ' + (LVL[s.l as Level] ?? s.l), com] as [string, string, string, string]];
  const lvl = LVL[s.l as Level] ?? s.l;
  if (!ok) {
    await db.update(osRequest).set({ steps, hist, status: 'Rejetée', updatedAt: new Date() }).where(eq(osRequest.id, id));
    if (r.type === 'dep') await engageBudget(r.domain, -r.amount); // dépense engagée dès la soumission
    await notifyStaff([r.byStaff], `${label(r)} rejetée : ${com}`, '/admin/moi', people);
    await audit(me.userId, 'os.demande.rejet', r.id, { niveau: lvl, motif: com });
    return null;
  }
  const cur = skipSelf(steps, r.cur + 1, r, people, delegs);
  const [u] = await db.update(osRequest).set({ steps, hist, cur, updatedAt: new Date() }).where(eq(osRequest.id, id)).returning();
  if (cur >= steps.length) await finalize(u, people);
  else {
    await notifyStep(u, people, delegs);
    await notifyStaff([r.byStaff], `${label(r)} : étape « ${lvl} » validée`, '/admin/moi', people);
  }
  await audit(me.userId, 'os.demande.approbation', r.id, { niveau: lvl });
  return null;
}

/** Fin de circuit : effets de la demande approuvée. */
async function finalize(r: Req, people: Person[]) {
  let status = 'Approuvée';
  if (r.type === 'dep') { status = 'Payée'; await engageBudget(r.domain, r.amount, 'realised'); }
  if (r.type === 'ndf') { status = 'Remboursée'; await engageBudget(r.domain, r.amount, 'realised'); }
  if (r.type === 'conge') {
    const days = Number(r.data.days) || 0;
    if (r.data.kind === 'Congé annuel' || !r.data.kind) await db.update(staff).set({ leaveDays: sql`greatest(0, ${staff.leaveDays} - ${days})`, updatedAt: new Date() }).where(eq(staff.id, r.byStaff));
  }
  if (r.type === 'achat') { status = 'Commandée'; await engageBudget(r.domain, r.amount); }
  if (r.type === 'contrat') status = 'Approuvé';
  await db.update(osRequest).set({ status, updatedAt: new Date() }).where(eq(osRequest.id, r.id));
  await notifyStaff([r.byStaff], `${label(r)} : ${status.toLowerCase()}`, '/admin/moi', people);
}

/** Budgets de l'année par domaine : { budget, engaged, realised } (zéro pour un domaine sans budget voté). */
export async function budgets(year = new Date().getFullYear()): Promise<Record<string, { budget: number; engaged: number; realised: number }>> {
  const rows = await db.select().from(osBudget).where(eq(osBudget.year, year));
  return Object.fromEntries(rows.map((r) => [r.domain, { budget: r.budget, engaged: r.engaged, realised: r.realised }]));
}
