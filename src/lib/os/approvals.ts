/* CEA OS — moteur de workflow et de validation (cahier des charges CEA OS, section 4 ; noyau : workflow-core.ts).
   - Configuration en base, modifiable sans développement : circuits V01 à V16, types de dossiers (pièces, phases, rejet, tâches
     d'exécution), seuils par type, pays et région (Processus et seuils). Valeurs de départ : workflow-defaults.ts.
   - Un dossier (table os_request) suit les phases de son type ; la phase « validation » déclenche le circuit, calculé selon le
     montant, la portée (plusieurs pays ou régions), le risque, la confidentialité et le caractère stratégique.
   - Pièce critique manquante : le dossier n'entre pas dans le circuit et revient à son auteur avec la liste des pièces.
   - Décisions : approuver, rejeter (motif obligatoire ; clos ou à corriger selon le type), demander une modification (motif
     obligatoire) ; chaque décision est inscrite au journal immuable os_wf_decision (niveau, seuil, approbateur, délégant,
     version, motif) et notifiée avec un lien direct vers le dossier.
   - Séparation des fonctions : le demandeur ne valide jamais son dossier ; une personne qui a déjà validé une étape ne valide
     pas une étape suivante du même dossier. Sans approbateur possible, l'étape est escaladée automatiquement (et tracée).
   - Délégations datées, limitées à des types de dossiers ; la décision prise sous délégation indique le délégant.
   - SLA : échéance par étape ; rappel, puis escalade au responsable de l'approbateur, puis à la Direction générale ; délai
     suspendu quand les approbateurs sont en congé ou ont délégué (slaSweep, tâche planifiée quotidienne).
   - Validation finale : effets propres au type (écritures, bon de commande, contrat, embauche…), tâches d'exécution créées
     depuis le modèle du type, prochaine action renseignée. */
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { osRequest, osDelegation, osBudget, osPo, osContract, osRecruit, osCandidate, osTask, osWfCircuit, osWfType, osWfThreshold, osWfDecision, osOrganMember, staff, type Step } from '../../db/schema/os';
import { hire } from './rh';
import { post } from './ledger';
import { getSetting } from '../settings';
import { notify } from '../notify';
import { audit } from '../session';
import { allStaff, MANAGERS, type Person } from './core';
import { regOf } from './ref';
import {
  ROLE, PHASE_LABEL, buildSteps, circuitLabel, eligible, missingCritical, nextPhase, sensitive, slaAction, addHours, thresholdsFor,
  type Circuit, type WfType, type ThresholdRow, type Thresholds, type Ctx, type Phase, type Role,
} from './workflow-core';
import { DEFAULT_CIRCUITS, DEFAULT_TYPES } from './workflow-defaults';

export type Req = typeof osRequest.$inferSelect;
export type { Thresholds };
export type ReqType = string;
/** Seuils généraux (toute l'organisation, tous types) : Paramétrage › seuils ; le seuil « dg » déclenche le Bureau panafricain. */
export const thresholds = async (): Promise<Thresholds> => ({ dg: 50_000_000, ...(await getSetting('seuils')) });
/** Libellé d'un circuit (« Représentant pays → Finance »). */
export const circuit = circuitLabel;

/* ===== Configuration (cache de 30 secondes, valeurs de départ insérées au premier usage) ===== */
export type WfConfig = { circuits: Map<string, Circuit>; types: Map<string, WfType>; thr: ThresholdRow[]; general: Thresholds };
let cfg: { at: number; v: WfConfig } | null = null;
let seeded = false;
export function invalidateWf() { cfg = null; }
export async function wfConfig(): Promise<WfConfig> {
  if (cfg && Date.now() - cfg.at < 30_000) return cfg.v;
  if (!seeded) {
    await db.insert(osWfCircuit).values(DEFAULT_CIRCUITS.map((c) => ({ code: c.code, family: c.family, name: c.name, steps: c.steps, escalade: c.escalade, origin: c.origin }))).onConflictDoNothing();
    await db.insert(osWfType).values(DEFAULT_TYPES.map((t) => ({ code: t.code, label: t.label, circuit: t.circuit, prefix: t.prefix, phases: t.phases, checklist: t.checklist, rejectTo: t.rejectTo, exec: t.exec, sla: t.sla, dueDays: t.dueDays, generic: t.generic }))).onConflictDoNothing();
    seeded = true;
  }
  const [cs, ts, th, general] = await Promise.all([db.select().from(osWfCircuit), db.select().from(osWfType), db.select().from(osWfThreshold), thresholds()]);
  const v: WfConfig = {
    circuits: new Map(cs.map((c) => [c.code, { ...c, steps: c.steps as Circuit['steps'], origin: c.origin as Circuit['origin'] }])),
    types: new Map(ts.map((t) => [t.code, { ...t, phases: t.phases as Phase[], rejectTo: t.rejectTo as WfType['rejectTo'] }])),
    thr: th.map((r) => ({ type: r.type, scope: r.scope, key: r.key as ThresholdRow['key'], amount: r.amount })),
    general,
  };
  cfg = { at: Date.now(), v };
  return v;
}
export const typeLabel = (c: WfConfig, code: string) => c.types.get(code)?.label ?? code;

/* ===== Personnes : délégations, organes, absences ===== */
type Deleg = typeof osDelegation.$inferSelect;
export type Organ = { organ: string; staffId: string; role: string };
export async function activeDelegations(): Promise<Deleg[]> {
  const now = new Date();
  return db.select().from(osDelegation).where(and(eq(osDelegation.revoked, false), gt(osDelegation.until, now), lte(osDelegation.start, now)));
}
export const organMembers = (): Promise<Organ[]> => db.select({ organ: osOrganMember.organ, staffId: osOrganMember.staffId, role: osOrganMember.role }).from(osOrganMember);
/** Collaborateurs en congé aujourd'hui (congés approuvés). */
async function onLeave(now = new Date()): Promise<Set<string>> {
  const rows = await db.select({ by: osRequest.byStaff, data: osRequest.data }).from(osRequest).where(and(eq(osRequest.type, 'conge'), eq(osRequest.status, 'Approuvée')));
  return new Set(rows.filter((r) => {
    const from = new Date(String(r.data.from) + 'T00:00:00'), days = Number(r.data.days) || 0;
    return now >= from && now < new Date(from.getTime() + days * 864e5 * 1.4); // jours ouvrés ≈ jours calendaires × 1,4
  }).map((r) => r.by));
}
type Env = { people: Person[]; delegs: Deleg[]; organs: Organ[] };
async function env(): Promise<Env> {
  const [people, delegs, organs] = await Promise.all([allStaff(), activeDelegations(), organMembers()]);
  return { people, delegs, organs };
}

/* ===== Approbateurs ===== */
type ReqLike = Pick<Req, 'byStaff' | 'country' | 'domain' | 'type'> & { steps?: Step[] };
/** Titulaires d'un jeton pour un dossier (sans délégation ni séparation des fonctions). */
function holders(l: string, r: ReqLike, people: Person[], organs: Organ[]): string[] {
  const act = (s?: Person) => !!s && s.active && !s.suspended;
  const dg = () => people.filter((s) => s.prof === 'dg' && act(s)).map((s) => s.id);
  const by = people.find((s) => s.id === r.byStaff);
  const up = (s?: Person) => people.find((x) => x.id === s?.managerId);
  if (l === 'manager' || l === 'manager2') {
    let m = up(by);
    if (l === 'manager2') m = up(m);
    while (m && !act(m)) m = up(m);
    return m ? [m.id] : dg();
  }
  let out: string[] = [];
  if (l === 'pays') out = people.filter((s) => s.prof === 'rep' && s.country === r.country && act(s)).map((s) => s.id);
  else if (l === 'reg') out = people.filter((s) => s.prof === 'dirreg' && s.reg === regOf(r.country) && act(s)).map((s) => s.id);
  else if (l === 'chef') out = people.filter((s) => s.prof === 'chef' && s.domain === r.domain && act(s)).map((s) => s.id);
  else if (l === 'fin') out = people.filter((s) => s.prof === 'fin' && s.poste !== 'D5' && act(s)).map((s) => s.id); // l'acheteur (D5) ne valide pas les paiements
  else if (l === 'bp' || l === 'ci' || l === 'cs') out = organs.filter((o) => o.organ === l).map((o) => o.staffId).filter((id) => act(people.find((s) => s.id === id)));
  else out = people.filter((s) => s.prof === l && act(s)).map((s) => s.id);
  if (!out.length && l === 'pays') return holders('reg', r, people, organs);
  if (!out.length && l === 'chef') return holders('manager', r, people, organs);
  return out.length ? out : dg();
}
/** Approbateurs effectifs d'une étape : titulaires, délégataires (dans le périmètre de la délégation), approbateurs ajoutés par
   escalade ; sans le demandeur ni ceux qui ont déjà validé une étape du dossier. */
export function approvers(step: Step | string, r: ReqLike, people: Person[], delegs: Deleg[], organs: Organ[] = []): { ids: string[]; via: Map<string, string> } {
  const s = typeof step === 'string' ? { l: step } as Step : step;
  const base = holders(s.l, r, people, organs);
  const via = new Map<string, string>(); // délégataire → délégant
  const all = [...base, ...(s.esc ?? [])];
  for (const id of base) for (const d of delegs) if (d.fromStaff === id && (!d.scope.length || d.scope.includes(r.type)) && !all.includes(d.toStaff)) { all.push(d.toStaff); via.set(d.toStaff, id); }
  const before = (r.steps ?? []).filter((x) => x !== s && x.st === 'ok' && x.whoId).map((x) => x.whoId!);
  return { ids: eligible(all, r.byStaff, before), via };
}
export const approverOf = (l: string, r: ReqLike, people: Person[], delegs: Deleg[], organs: Organ[] = []) => approvers(l, r, people, delegs, organs).ids;
const isApprover = (r: Req, meId: string, e: Env) => { const s = r.steps[r.cur]; return !!s && approvers(s, r, e.people, e.delegs, e.organs).ids.includes(meId); };

/* ===== Journal et notifications ===== */
type By = { id?: string | null; name: string };
async function log(r: Pick<Req, 'id' | 'version'>, decision: string, by: By, o: { step?: number; level?: string; threshold?: string; delegant?: string; motif?: string; proof?: string } = {}) {
  await db.insert(osWfDecision).values({ requestId: r.id, version: r.version, step: o.step ?? null, level: o.level ?? null, threshold: o.threshold ?? null, decision, byStaff: by.id ?? null, byName: by.name, delegant: o.delegant ?? null, motif: o.motif || null, proof: o.proof || null });
}
/** Notifie des collaborateurs (ceux qui ont un compte). */
export async function notifyStaff(ids: string[], title: string, link: string, people?: Person[]) {
  const ps = people ?? await allStaff();
  for (const id of new Set(ids)) {
    const u = ps.find((s) => s.id === id)?.userId;
    if (u) await notify(u, title, link).catch(() => {});
  }
}
export const objLink = (id: string) => `/os/flux/${id}`;
const label = (c: WfConfig, r: Pick<Req, 'type' | 'id' | 'title'>) => `${typeLabel(c, r.type)} ${r.id} — ${r.title}`;
const roleName = (l: string) => ROLE[l as Role] ?? l;

async function notifyStep(c: WfConfig, r: Req, e: Env) {
  const s = r.steps[r.cur];
  if (s) await notifyStaff(approvers(s, r, e.people, e.delegs, e.organs).ids, `À valider : ${label(c, r)}`, objLink(r.id), e.people);
}

/** Engagement budgétaire du domaine pour l'année en cours (dépenses et achats). */
export async function engageBudget(domain: string | null | undefined, amt: number, col: 'engaged' | 'realised' = 'engaged') {
  if (!domain || !amt) return;
  const year = new Date().getFullYear();
  await db.insert(osBudget).values({ year, domain, [col]: amt }).onConflictDoUpdate({ target: [osBudget.year, osBudget.domain], set: { [col]: sql`${osBudget[col]} + ${amt}`, updatedAt: new Date() } });
}

/* ===== Circuit d'un dossier ===== */
const ctxOf = (r: Pick<Req, 'amount' | 'country' | 'countries' | 'strategic' | 'conf' | 'risk' | 'data'>): Ctx => ({
  amount: r.amount, country: r.country, countries: r.countries, regionOf: regOf, strategic: r.strategic, conf: r.conf, risk: r.risk,
  lvl: r.data.lvl === 'agent' ? 'agent' : r.data.lvl === 'cadre' ? 'cadre' : undefined,
});
/** Étapes du circuit d'un dossier (aussi utilisé pour l'aperçu avant soumission). */
export function stepsFor(c: WfConfig, r: Pick<Req, 'type' | 'amount' | 'country' | 'countries' | 'strategic' | 'conf' | 'risk' | 'data'>): Step[] {
  const t = c.types.get(r.type);
  const ci = t && c.circuits.get(t.circuit);
  if (!t || !ci || !ci.active) return [];
  const thr = thresholdsFor(r.type, r.country, regOf(r.country), c.thr, c.general);
  return buildSteps(ci, ctxOf(r), thr, t.sla).map((s) => ({ l: s.l, st: 'attente', sla: s.sla, ...(s.why ? { why: s.why } : {}) }));
}

/** Étapes que personne ne peut valider (séparation des fonctions) : escaladées automatiquement et tracées. Renvoie l'étape en cours. */
async function skipBlocked(r: Req, steps: Step[], cur: number, e: Env): Promise<number> {
  while (cur < steps.length && !approvers(steps[cur], { ...r, steps }, e.people, e.delegs, e.organs).ids.length) {
    steps[cur] = { ...steps[cur], st: 'ok', who: 'Escalade automatique (aucun approbateur autre que le demandeur ou un précédent approbateur)', at: new Date().toISOString() };
    await log(r, 'escalade', { name: 'CEA OS' }, { step: cur, level: steps[cur].l, motif: 'Séparation des fonctions : étape passée faute d’approbateur distinct' });
    cur++;
  }
  return cur;
}
const enter = (steps: Step[], cur: number, now = new Date()) => {
  if (cur < steps.length) steps[cur] = { ...steps[cur], due: addHours(now, steps[cur].sla ?? 48).toISOString() };
  return cur < steps.length ? new Date(steps[cur].due!) : null;
};

/* ===== Création, soumission ===== */
export type NewReq = {
  title: string; amount?: number; country?: string; domain?: string | null; data?: Record<string, unknown>; lvl?: 'agent' | 'cadre';
  countries?: string[]; conf?: string; risk?: string; strategic?: boolean; description?: string; owner?: string; due?: Date; pieces?: Record<string, string>; draft?: boolean;
};
async function newId(prefix: string): Promise<string> {
  return prefix + randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
}
/** Crée un dossier. Un type dont la première phase est la validation (demandes classiques) est soumis aussitôt ; sinon le
   dossier commence à sa première phase et son responsable le fait avancer (WFL-01). */
export async function createRequest(me: Person, type: ReqType, o: NewReq): Promise<Req> {
  const c = await wfConfig();
  const t = c.types.get(type);
  if (!t || !t.active) throw new Error('Type de dossier inconnu ou désactivé.');
  const country = o.country ?? me.country;
  const countries = [...new Set([country, ...(o.countries ?? [])])];
  let row: Req | undefined;
  for (let i = 0; i < 4 && !row; i++) {
    [row] = await db.insert(osRequest).values({
      id: await newId(t.prefix), type, title: o.title, amount: Math.round(o.amount ?? 0), country, countries, domain: o.domain ?? me.domain ?? 'prj', byStaff: me.id,
      owner: o.owner ?? me.id, due: o.due ?? addHours(new Date(), t.dueDays * 24), description: o.description ?? null,
      data: { ...(o.data ?? {}), ...(o.lvl ? { lvl: o.lvl } : {}) }, pieces: o.pieces ?? {}, conf: o.conf ?? 'Interne', risk: o.risk ?? 'normal', strategic: !!o.strategic,
      circuit: t.circuit, phase: t.phases[0], status: 'Brouillon', nextAction: t.phases[0] === 'validation' ? 'Soumettre' : `Passer à « ${PHASE_LABEL[nextPhase(t, t.phases[0]) ?? 'validation']} »`,
    }).onConflictDoNothing().returning();
  }
  if (!row) throw new Error('Référence de dossier indisponible, réessayez.');
  await log(row, 'cree', { id: me.id, name: me.name }, { motif: `Phase « ${PHASE_LABEL[t.phases[0]] ?? t.phases[0]} »` });
  await audit(me.userId, 'os.demande.creation', row.id, { type, amount: row.amount });
  if (t.phases[0] === 'validation' && !o.draft) {
    const err = await submit(row, me);
    if (err) throw new Error(err);
    [row] = await db.select().from(osRequest).where(eq(osRequest.id, row.id));
  }
  return row;
}

/** Soumission au circuit (phase « validation ») : contrôle des pièces critiques, calcul du circuit, notification. Renvoie un message d'erreur ou null. */
export async function submit(r: Req, me: Person): Promise<string | null> {
  const [c, e] = await Promise.all([wfConfig(), env()]);
  const t = c.types.get(r.type);
  if (!t) return 'Type de dossier inconnu.';
  const miss = missingCritical(t.checklist, r.pieces);
  if (miss.length) {
    const list = miss.map((m) => m.label).join(', ');
    await db.update(osRequest).set({ status: 'Pièces demandées', phase: 'validation', nextAction: `Fournir : ${list}`, updatedAt: new Date() }).where(eq(osRequest.id, r.id));
    await log(r, 'pieces_manquantes', { id: me.id, name: me.name }, { motif: list });
    await notifyStaff([r.byStaff], `${label(c, r)} : pièces à fournir avant validation — ${list}`, objLink(r.id), e.people);
    return null;
  }
  const steps = stepsFor(c, r);
  const base = { ...r, steps };
  const cur = await skipBlocked(base, steps, 0, e);
  const stepDue = enter(steps, cur);
  const [u] = await db.update(osRequest).set({ steps, cur, status: 'En approbation', phase: 'validation', stepDue, reminded: 0, nextAction: cur < steps.length ? `Validation : ${roleName(steps[cur].l)}` : null, updatedAt: new Date() }).where(eq(osRequest.id, r.id)).returning();
  await log(u, r.version > 1 ? 'resoumis' : 'soumis', { id: me.id, name: me.name }, { motif: `Circuit ${t.circuit} : ${circuitLabel(steps)}` });
  if (cur >= steps.length) await finalize(c, u, e);
  else await notifyStep(c, u, e);
  return null;
}

/** Le responsable fait avancer le dossier à la phase suivante (l'ordre du workflow universel ne peut pas être contourné).
   Entrer en validation soumet le dossier ; clore exige une preuve et des tâches d'exécution terminées (WFL-02, WFL-08). */
export async function advance(id: string, me: Person, o: { proof?: string; lesson?: string } = {}): Promise<string | null> {
  const [c, [r]] = await Promise.all([wfConfig(), db.select().from(osRequest).where(eq(osRequest.id, id))]);
  if (!r) return 'Dossier introuvable.';
  if (r.owner !== me.id && r.byStaff !== me.id) return 'Seul le responsable du dossier le fait avancer.';
  const t = c.types.get(r.type);
  if (!t) return 'Type de dossier inconnu.';
  if (r.status === 'En approbation') return 'Le dossier est en cours de validation.';
  if (['Rejetée', 'Clôturé'].includes(r.status) && r.phase !== 'cloture') return 'Ce dossier est clos.';
  const next = nextPhase(t, r.phase);
  if (!next) return 'Le dossier est à sa dernière phase.';
  if (next === 'validation') return submit(r, me);
  if (next === 'cloture') {
    if (!o.proof?.trim()) return 'Indiquez la preuve de réalisation (livrable, document, référence) pour clore le dossier.';
    if (!r.owner) return 'Un dossier sans responsable ne peut pas être clos.';
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osTask).where(and(sql`${osTask.title} like ${`[${r.id}]%`}`, sql`${osTask.status} <> 'Terminé'`));
    if (n > 0) return `${n} tâche(s) d'exécution restent à terminer.`;
  }
  if (next === 'capitalisation' && !o.lesson?.trim()) return "Indiquez l'enseignement à capitaliser (ce qui a marché, ce qu'il faut changer).";
  const after = nextPhase(t, next);
  const status = next === 'cloture' ? 'Clôturé' : next === 'capitalisation' ? 'Capitalisé' : r.status === 'Brouillon' ? 'En cours' : r.status;
  await db.update(osRequest).set({
    phase: next, status, proof: next === 'cloture' ? o.proof!.trim() : r.proof, data: next === 'capitalisation' ? { ...r.data, lecon: o.lesson!.trim() } : r.data,
    nextAction: after ? `Passer à « ${PHASE_LABEL[after]} »` : null, updatedAt: new Date(),
  }).where(eq(osRequest.id, id));
  await log(r, 'phase', { id: me.id, name: me.name }, { motif: `${PHASE_LABEL[r.phase as Phase] ?? r.phase} → ${PHASE_LABEL[next]}`, proof: next === 'cloture' ? o.proof : next === 'capitalisation' ? o.lesson : undefined });
  return null;
}

/** Propriétés obligatoires modifiables par le responsable ou son responsable hiérarchique : responsable, échéance, prochaine action, pièces. */
export async function setProps(id: string, me: Person, p: { owner?: string; due?: Date; nextAction?: string; pieces?: Record<string, string> }): Promise<string | null> {
  const [r] = await db.select().from(osRequest).where(eq(osRequest.id, id));
  if (!r) return 'Dossier introuvable.';
  const people = await allStaff();
  const ownerP = people.find((s) => s.id === r.owner);
  if (![r.owner, r.byStaff, ownerP?.managerId].includes(me.id) && me.prof !== 'dg') return 'Modification réservée au responsable du dossier et à son responsable hiérarchique.';
  if (p.owner && !people.some((s) => s.id === p.owner && s.active)) return 'Responsable inconnu ou inactif.';
  await db.update(osRequest).set({ ...(p.owner ? { owner: p.owner } : {}), ...(p.due ? { due: p.due } : {}), ...(p.nextAction !== undefined ? { nextAction: p.nextAction.trim() || null } : {}), ...(p.pieces ? { pieces: { ...r.pieces, ...p.pieces } } : {}), updatedAt: new Date() }).where(eq(osRequest.id, id));
  await log(r, 'proprietes', { id: me.id, name: me.name }, { motif: [p.owner && `responsable ${people.find((s) => s.id === p.owner)?.name}`, p.due && `échéance ${p.due.toISOString().slice(0, 10)}`, p.nextAction !== undefined && `prochaine action « ${p.nextAction} »`, p.pieces && `pièces ${Object.keys(p.pieces).join(', ')}`].filter(Boolean).join(' · ') });
  if (p.owner && p.owner !== r.owner) await notifyStaff([p.owner], `Vous êtes responsable du dossier ${r.id} — ${r.title}`, objLink(r.id), people);
  return null;
}

/** Nouvelle soumission par l'auteur après une demande de modification, un rejet « à corriger » ou des pièces manquantes. */
export async function resubmit(id: string, me: Person, p: { pieces?: Record<string, string>; title?: string; amount?: number; description?: string } = {}): Promise<string | null> {
  const [r] = await db.select().from(osRequest).where(eq(osRequest.id, id));
  if (!r) return 'Dossier introuvable.';
  if (r.byStaff !== me.id && r.owner !== me.id) return "Seul l'auteur ou le responsable du dossier peut le soumettre à nouveau.";
  if (!['À modifier', 'À corriger', 'Pièces demandées'].includes(r.status)) return "Ce dossier n'attend pas de nouvelle soumission.";
  const inCircuit = r.status !== 'Pièces demandées';
  const [u] = await db.update(osRequest).set({
    version: inCircuit ? r.version + 1 : r.version, pieces: { ...r.pieces, ...(p.pieces ?? {}) }, ...(p.title ? { title: p.title } : {}), ...(p.amount !== undefined ? { amount: Math.round(p.amount) } : {}),
    ...(p.description !== undefined ? { description: p.description } : {}), updatedAt: new Date(),
  }).where(eq(osRequest.id, id)).returning();
  return submit(u, me);
}

/* ===== Décisions ===== */
export type Pending = { r: Req; lvl: string };
/** Éléments qui attendent la décision d'un collaborateur. */
export async function pendingFor(meId: string | null | undefined, ctx?: { people?: Person[]; delegs?: Deleg[] }): Promise<Pending[]> {
  if (!meId) return [];
  const [people, delegs, organs, reqs] = await Promise.all([ctx?.people ?? allStaff(), ctx?.delegs ?? activeDelegations(), organMembers(), db.select().from(osRequest).where(eq(osRequest.status, 'En approbation')).orderBy(desc(osRequest.createdAt))]);
  return reqs.flatMap((r) => (isApprover(r, meId, { people, delegs, organs }) ? [{ r, lvl: roleName(r.steps[r.cur].l) }] : []));
}

export type Decision = 'approuve' | 'rejete' | 'modifier';
/** Décision sur l'étape en cours. ok = true/false conservé pour les appels existants (approuver / rejeter). */
export async function decide(id: string, me: Person, ok: boolean | Decision, com = ''): Promise<string | null> {
  const dec: Decision = ok === true ? 'approuve' : ok === false ? 'rejete' : ok;
  const [c, e, [r]] = await Promise.all([wfConfig(), env(), db.select().from(osRequest).where(eq(osRequest.id, id))]);
  if (!r || r.status !== 'En approbation') return 'Ce dossier n’est plus en attente de validation.';
  const s = r.steps[r.cur];
  const ap = s ? approvers(s, r, e.people, e.delegs, e.organs) : null;
  if (!s || !ap?.ids.includes(me.id)) return r.byStaff === me.id ? 'Vous ne pouvez pas valider votre propre dossier.' : 'Vous n’êtes pas approbateur de cette étape.';
  if (dec !== 'approuve' && !com.trim()) return dec === 'rejete' ? 'Indiquez le motif du rejet.' : 'Indiquez les modifications attendues.';
  const t = c.types.get(r.type);
  const now = new Date().toISOString();
  const delegant = ap.via.get(me.id);
  const delegantName = delegant ? e.people.find((p) => p.id === delegant)?.name : undefined;
  const steps = r.steps.map((x, i) => (i === r.cur ? { ...x, st: dec === 'approuve' ? 'ok' : dec === 'rejete' ? 'rejet' : 'modifier', who: me.name + (delegantName ? ` (par délégation de ${delegantName})` : ''), whoId: me.id, ...(delegant ? { dlg: delegant } : {}), at: now, com } as Step : x));
  const lvl = roleName(s.l);
  const verb = { approuve: 'Approuvé', rejete: 'Rejeté', modifier: 'Modification demandée' }[dec];
  const hist = [...r.hist, [now, me.name, `${verb} — ${lvl}`, com] as [string, string, string, string]];
  await log(r, dec, { id: me.id, name: me.name }, { step: r.cur, level: s.l, threshold: s.why, delegant, motif: com });
  if (dec !== 'approuve') {
    const final = dec === 'rejete' && t?.rejectTo !== 'corrige';
    const before = t ? t.phases[Math.max(0, t.phases.indexOf('validation') - 1)] : 'validation';
    const status = dec === 'modifier' ? 'À modifier' : final ? 'Rejetée' : 'À corriger';
    await db.update(osRequest).set({ steps, hist, status, phase: final ? 'cloture' : before, stepDue: null, nextAction: final ? null : `Corriger puis soumettre à nouveau : ${com}`, updatedAt: new Date() }).where(eq(osRequest.id, id));
    if (final) {
      if (r.type === 'dep') await engageBudget(r.domain, -r.amount); // dépense engagée dès la soumission
      if (r.type === 'recrut' && r.data.rec) await db.update(osRecruit).set({ status: 'Refusée' }).where(eq(osRecruit.id, String(r.data.rec)));
      if (r.type === 'offre' && r.data.cand) await db.update(osCandidate).set({ status: 'Entretien' }).where(eq(osCandidate.id, String(r.data.cand)));
    }
    await notifyStaff([r.byStaff, r.owner ?? r.byStaff], `${label(c, r)} — ${status.toLowerCase()} (${lvl}) : ${com}`, objLink(r.id), e.people);
    await audit(me.userId, dec === 'rejete' ? 'os.demande.rejet' : 'os.demande.modification', r.id, { niveau: lvl, motif: com, delegant });
    return null;
  }
  const next = { ...r, steps };
  const cur = await skipBlocked(next, steps, r.cur + 1, e);
  const stepDue = enter(steps, cur);
  const [u] = await db.update(osRequest).set({ steps, hist, cur, stepDue, reminded: 0, nextAction: cur < steps.length ? `Validation : ${roleName(steps[cur].l)}` : null, updatedAt: new Date() }).where(eq(osRequest.id, id)).returning();
  if (cur >= steps.length) await finalize(c, u, e);
  else {
    await notifyStep(c, u, e);
    await notifyStaff([r.byStaff], `${label(c, r)} : étape « ${lvl} » validée`, objLink(r.id), e.people);
  }
  await audit(me.userId, 'os.demande.approbation', r.id, { niveau: lvl, delegant });
  return null;
}

/** Fin de circuit : effets propres au type, tâches d'exécution depuis le modèle du type (WFL-08). */
async function finalize(c: WfConfig, r: Req, e: Env) {
  const people = e.people;
  let status = 'Approuvée';
  const meta = { country: r.country, domain: r.domain, ref: r.id };
  if (r.type === 'dep') {
    status = 'Payée'; await engageBudget(r.domain, r.amount, 'realised');
    await post('AC', r.title, [['638', r.amount, 0], ['401', 0, r.amount]], meta);
    await post('BQ', 'Paiement ' + r.id, [['401', r.amount, 0], ['521', 0, r.amount]], meta);
  }
  if (r.type === 'ndf') {
    status = 'Remboursée'; await engageBudget(r.domain, r.amount, 'realised');
    const who = people.find((p) => p.id === r.byStaff)?.name ?? '';
    await post('OD', `Note de frais ${r.id} — ${who}`, [[r.data.cat === 'Transport' ? '618' : '638', r.amount, 0], ['421', 0, r.amount]], meta);
    await post('BQ', 'Remboursement ' + r.id, [['421', r.amount, 0], ['585', 0, r.amount]], meta);
  }
  if (r.type === 'conge') {
    const days = Number(r.data.days) || 0;
    if (r.data.kind === 'Congé annuel' || !r.data.kind) await db.update(staff).set({ leaveDays: sql`greatest(0, ${staff.leaveDays} - ${days})`, updatedAt: new Date() }).where(eq(staff.id, r.byStaff));
  }
  if (r.type === 'achat') {
    status = 'Commandée'; await engageBudget(r.domain, r.amount);
    const year = new Date().getFullYear();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osPo).where(sql`${osPo.id} like ${`BC-${year}-%`}`);
    const sup = typeof r.data.supplier === 'string' && /^FRN-/.test(r.data.supplier) ? r.data.supplier : null;
    await db.insert(osPo).values({ id: `BC-${year}-${String(n + 1).padStart(3, '0')}`, byStaff: r.byStaff, supplierId: sup, label: r.title, itemCode: (r.data.item as string) || null, qty: Number(r.data.qty) || 0, amount: r.amount, country: r.country, domain: r.domain, requestId: r.id });
  }
  if (r.type === 'contrat') {
    status = 'Approuvé';
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osContract);
    await db.insert(osContract).values({ id: `CTR-${30 + n}`, title: r.title, party: String(r.data.party ?? ''), type: String(r.data.ctype ?? 'Prestation'), domain: r.domain, country: r.country, amount: r.amount, end: r.data.end ? new Date(String(r.data.end)) : new Date(Date.now() + 365 * 864e5), owner: r.byStaff, requestId: r.id });
  }
  if (r.type === 'recrut' && r.data.rec) {
    await db.update(osRecruit).set({ status: 'Validée' }).where(eq(osRecruit.id, String(r.data.rec)));
    await notifyStaff(people.filter((p) => p.prof === 'rh' && p.active).map((p) => p.id), `Recrutement validé : ${r.title} — à publier`, '/os/recrutement', people);
  }
  if (r.type === 'offre' && r.data.rec && r.data.cand) {
    const [x] = await db.select().from(osRecruit).where(eq(osRecruit.id, String(r.data.rec)));
    const [cd] = await db.select().from(osCandidate).where(eq(osCandidate.id, String(r.data.cand)));
    if (x && cd && x.status !== 'Pourvu') await hire(x, cd, r.amount, people, null, '');
  }
  const t = c.types.get(r.type);
  const owner = r.owner ?? r.byStaff;
  const tasks = t?.exec ?? [];
  if (tasks.length) await db.insert(osTask).values(tasks.map((x) => ({ title: `[${r.id}] ${x.title}`, owner, country: r.country, domain: r.domain, due: addHours(new Date(), x.days * 24), createdBy: owner })));
  // Demandes classiques : effets appliqués, le dossier est clos ; dossiers génériques : exécution par le responsable
  const generic = !!t?.generic && t.phases.includes('execution');
  const phase = generic ? 'execution' : 'cloture';
  const nextAction = generic ? (tasks.length ? `Réaliser : ${tasks[0].title}` : t && nextPhase(t, 'execution') ? `Passer à « ${PHASE_LABEL[nextPhase(t, 'execution')!]} »` : null) : null;
  const [u] = await db.update(osRequest).set({ status, phase, stepDue: null, nextAction, updatedAt: new Date() }).where(eq(osRequest.id, r.id)).returning();
  await log(u, 'valide', { name: 'CEA OS' }, { motif: `${status}${tasks.length ? ` · ${tasks.length} tâche(s) d'exécution créée(s)` : ''}` });
  await notifyStaff([r.byStaff, owner], `${label(c, r)} : ${status.toLowerCase()}`, objLink(r.id), people);
}

/* ===== Délais (SLA), rappels, escalades — tâche planifiée quotidienne ===== */
export async function slaSweep(now = new Date()) {
  const [c, e, away, list] = await Promise.all([wfConfig(), env(), onLeave(now), db.select().from(osRequest).where(and(eq(osRequest.status, 'En approbation'), lte(osRequest.stepDue, now)))]);
  const out = { rappels: 0, escalades: 0, suspendus: 0 };
  for (const r of list) {
    const s = r.steps[r.cur];
    if (!s) continue;
    const titulaires = holders(s.l, r, e.people, e.organs);
    const suspended = titulaires.length > 0 && titulaires.every((id) => away.has(id) || e.delegs.some((d) => d.fromStaff === id));
    const act = slaAction(r.stepDue, now, r.reminded, suspended);
    if (act === 'rien') continue;
    const steps = [...r.steps];
    if (act === 'suspendre') {
      await db.update(osRequest).set({ stepDue: addHours(now, 24) }).where(eq(osRequest.id, r.id));
      await log(r, 'sla_suspendu', { name: 'CEA OS' }, { step: r.cur, level: s.l, motif: 'Approbateur en congé ou ayant délégué : délai prolongé de 24 h' });
      out.suspendus++;
      continue;
    }
    if (act === 'rappel') {
      await notifyStaff(approvers(s, r, e.people, e.delegs, e.organs).ids, `Rappel — en retard : ${label(c, r)}`, objLink(r.id), e.people);
      await db.update(osRequest).set({ reminded: 1 }).where(eq(osRequest.id, r.id));
      await log(r, 'rappel', { name: 'CEA OS' }, { step: r.cur, level: s.l, motif: 'Délai de validation dépassé' });
      out.rappels++;
      continue;
    }
    // Escalade : au responsable de chaque approbateur, puis à la Direction générale (ou au Bureau panafricain si elle est déjà en cause)
    const up = act === 'escalade1'
      ? titulaires.map((id) => e.people.find((p) => p.id === id)?.managerId).filter((x): x is string => !!x)
      : holders(s.l === 'dg' ? 'bp' : 'dg', r, e.people, e.organs);
    const add = up.filter((id) => id !== r.byStaff && !(s.esc ?? []).includes(id));
    steps[r.cur] = { ...s, esc: [...(s.esc ?? []), ...add] };
    await db.update(osRequest).set({ steps, reminded: act === 'escalade1' ? 2 : 3 }).where(eq(osRequest.id, r.id));
    await notifyStaff(add, `Escalade — validation en retard : ${label(c, r)}`, objLink(r.id), e.people);
    await log(r, 'escalade', { name: 'CEA OS' }, { step: r.cur, level: s.l, motif: `Retard : ${add.map((id) => e.people.find((p) => p.id === id)?.name ?? id).join(', ') || 'aucun niveau supérieur'} ajouté(s) comme approbateur(s)` });
    out.escalades++;
  }
  return out;
}

/* ===== Visibilité (ABAC) ===== */
/** Un collaborateur peut-il voir ce dossier ? Participants (auteur, responsable, approbateurs, délégataires) ; direction ;
   managers de son périmètre pour un dossier interne ; chaîne hiérarchique de l'auteur pour un dossier confidentiel ;
   participants et Direction générale seulement pour un dossier strictement confidentiel. */
export function canSee(me: Person | null, superuser: boolean, r: Req, e: Pick<Env, 'people' | 'delegs' | 'organs'>, inScope: (x: { country?: string | null; domain?: string | null }) => boolean): boolean {
  if (superuser) return true;
  if (!me) return false;
  const participants = new Set([r.byStaff, r.owner, ...r.steps.flatMap((s) => [s.whoId, ...(s.esc ?? [])])].filter(Boolean) as string[]);
  const s = r.steps[r.cur];
  if (r.status === 'En approbation' && s) approvers(s, r, e.people, e.delegs, e.organs).ids.forEach((id) => participants.add(id));
  if (participants.has(me.id) || me.prof === 'dg') return true;
  if (r.conf === 'Strictement confidentiel') return false;
  if (sensitive(r.conf)) {
    let m = e.people.find((p) => p.id === r.byStaff);
    for (let i = 0; i < 8 && m?.managerId; i++) { if (m.managerId === me.id) return true; m = e.people.find((p) => p.id === m!.managerId); }
    return false;
  }
  return MANAGERS.split(' ').includes(me.prof) && r.countries.concat(r.country).some((country) => inScope({ country, domain: r.domain }));
}
export { env as wfEnv };

/** Budgets de l'année par domaine : { budget, engaged, realised } (zéro pour un domaine sans budget voté). */
export async function budgets(year = new Date().getFullYear()): Promise<Record<string, { budget: number; engaged: number; realised: number }>> {
  const rows = await db.select().from(osBudget).where(eq(osBudget.year, year));
  return Object.fromEntries(rows.map((r) => [r.domain, { budget: r.budget, engaged: r.engaged, realised: r.realised }]));
}
