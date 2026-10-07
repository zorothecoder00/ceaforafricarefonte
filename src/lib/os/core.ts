/* CEA OS — personnel, profils d'accès, menu et périmètre (prototype CEA OS).
   - Le profil d'accès d'un collaborateur découle de son poste (profOf) ; les administrateurs du site (rôle admin) et la
     direction (rôle direction) voient tous les modules, même sans fiche personnel.
   - Périmètre : pays pour un représentant, région pour un directeur régional, domaine pour un chef de département ou un
     analyste ; le sélecteur « Périmètre » de la barre du haut restreint l'affichage (cookie os-scope). */
import { asc, eq } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { db } from '../db';
import { staff } from '../../db/schema/os';
import { PAYS, PK, REGIONS, DOM, regOf, pn, profOf, type Prof, type Region, type Dom } from './ref';
import type { CurrentUser } from '../session';
import type { Obj } from '../rbac';

export type StaffRow = typeof staff.$inferSelect;
export type Person = StaffRow & { prof: Prof; reg: Region | null };
export const person = (s: StaffRow): Person => {
  const prof = profOf(s.poste);
  return { ...s, prof, reg: prof === 'dirreg' ? regOf(s.country) : null };
};

/** Tous les collaborateurs (quelques centaines au plus), triés par matricule. */
export async function allStaff(): Promise<Person[]> {
  return (await db.select().from(staff).orderBy(asc(staff.id))).map(person);
}
export async function staffById(id: string | null | undefined): Promise<Person | null> {
  if (!id) return null;
  const [s] = await db.select().from(staff).where(eq(staff.id, id));
  return s ? person(s) : null;
}
/** Prochain matricule libre : EMP001, EMP002… */
export async function nextEmp(): Promise<string> {
  const ids = await db.select({ id: staff.id }).from(staff);
  return 'EMP' + String(Math.max(0, ...ids.map((x) => Number(x.id.slice(3)) || 0)) + 1).padStart(3, '0');
}

/* ===== Contexte de l'utilisateur connecté ===== */
export type OsCtx = { user: CurrentUser; me: Person | null; prof: Prof | null; superuser: boolean };
export async function osContext(user: CurrentUser): Promise<OsCtx> {
  const me = await staffById(user.staffId);
  const superuser = user.roles.includes('admin') || user.roles.includes('direction');
  return { user, me, prof: me?.prof ?? null, superuser };
}

/* ===== Accès aux modules (spécifications du prototype : profils séparés par des espaces, « chef:kap » = profil + domaine) ===== */
export const ALL = 'dg adg ops fin rh jur conf com it chef analyste dirreg rep cond agent';
export const MANAGERS = 'dg adg ops chef dirreg rep fin rh';
export function canUse(spec: string, c: Pick<OsCtx, 'me' | 'prof' | 'superuser'>) {
  if (c.superuser) return true;
  if (!c.prof) return false;
  return spec.split(' ').some((t) => t === c.prof || (t.includes(':') && t.split(':')[0] === c.prof && t.split(':')[1] === c.me?.domain));
}

/* ===== Menu (rubriques du prototype). Une entrée est gardée soit par un profil (spec), soit par un droit du site (obj).
   dom : pastille de couleur du domaine. staff : réservé aux collaborateurs ayant une fiche personnel. ===== */
export type NavItem = { href: string; label: string; spec?: string; obj?: Obj; dom?: Dom; staff?: boolean };
export const MODS: [string, NavItem[]][] = [
  ['Mon espace', [
    { href: '/admin', label: 'Accueil' },
    { href: '/admin/poste', label: 'Mon poste et mes indicateurs', spec: ALL, staff: true },
    { href: '/admin/moi', label: 'Mes demandes', spec: ALL, staff: true },
    { href: '/admin/moi/temps', label: 'Mes temps', spec: ALL, staff: true },
    { href: '/admin/annuaire', label: 'Annuaire du personnel', spec: ALL },
  ]],
  ['Pilotage', [
    { href: '/admin/approbations', label: 'Approbations', spec: ALL },
    { href: '/admin/rapports', label: 'Rapports', obj: 'rapports' },
  ]],
  ['Relations', [
    { href: '/admin/crm', label: 'Contacts (CRM 360°)', obj: 'crm' },
    { href: '/admin/campagnes', label: 'Campagnes', obj: 'campagnes' },
    { href: '/admin/messages', label: 'Messages et signalements', obj: 'messages_contact' },
  ]],
  ["Domaines d'intervention", [
    { href: '/admin/kapital', label: DOM.kap.n, obj: 'dossier_kapital', dom: 'kap' },
    { href: '/admin/projets', label: DOM.prj.n, obj: 'fiche_projet', dom: 'prj' },
    { href: '/admin/emplois', label: DOM.tal.n, obj: 'offre_emploi', dom: 'tal' },
    { href: '/admin/programmes', label: DOM.aca.n, obj: 'programmes', dom: 'aca' },
    { href: '/admin/candidatures', label: 'Candidatures aux programmes', obj: 'candidature', dom: 'aca' },
  ]],
  ['Gestion', [
    { href: '/admin/finance', label: 'Finance et comptabilité', obj: 'paiements' },
    { href: '/admin/paiements', label: 'Paiements', obj: 'paiements' },
    { href: '/admin/rh', label: 'Ressources humaines', spec: 'dg rh' },
  ]],
  ['Support et administration', [
    { href: '/admin/documents', label: 'Documents', obj: 'documents' },
    { href: '/admin/processus', label: 'Processus et seuils', spec: 'dg ops it conf' },
    { href: '/admin/conformite', label: 'Conformité KYC', obj: 'pieces_kyc' },
    { href: '/admin/membres', label: 'Comptes et rôles', obj: 'membres' },
    { href: '/admin/droits', label: 'Matrice des droits', obj: 'contenus' },
    { href: '/admin/audit', label: "Journal d'audit", obj: 'journal_audit' },
    { href: '/admin/parametrage', label: 'Paramétrage', obj: 'parametres' },
  ]],
  ['Site et communauté', [
    { href: '/admin/cms', label: 'CMS éditorial', obj: 'contenus' },
    { href: '/admin/textes', label: 'Textes du site', obj: 'contenus' },
    { href: '/admin/domaines', label: "Domaines d'intervention (site)", obj: 'parametres' },
    { href: '/admin/contenus', label: 'Contenus et voix', obj: 'contenus' },
    { href: '/admin/moderation', label: 'Modération', obj: 'moderation' },
    { href: '/admin/assemblees', label: 'Assemblées et votes', obj: 'journal_audit' },
    { href: '/admin/formulaires', label: 'Formulaires', obj: 'formulaires' },
    { href: '/admin/automatisations', label: 'Automatisations', obj: 'automatisations' },
    { href: '/admin/interrupteurs', label: 'Interrupteurs par pays', obj: 'interrupteurs' },
  ]],
];
/** Module (entrée du menu) d'un chemin : l'entrée la plus spécifique dont le chemin préfixe celui de la page. */
export function moduleOf(path: string): NavItem | undefined {
  const all = MODS.flatMap(([, it]) => it);
  return all.filter((i) => path === i.href || (i.href !== '/admin' && path.startsWith(i.href + '/'))).sort((a, b) => b.href.length - a.href.length)[0];
}

/* ===== Périmètre ===== */
export type Scope = { pays?: string; reg?: Region; dom?: string };
export function userScope(c: Pick<OsCtx, 'me' | 'superuser'>): Scope {
  const u = c.me;
  if (c.superuser || !u) return {};
  const p = profOf(u.poste);
  if (['dg', 'adg', 'fin', 'rh', 'jur', 'conf', 'com', 'it', 'ops'].includes(p)) return {};
  if (p === 'chef' || p === 'analyste') return { dom: u.domain ?? undefined };
  if (p === 'dirreg') return { reg: regOf(u.country) ?? undefined };
  if (p === 'rep') return { pays: u.country };
  return { pays: u.country, dom: u.domain ?? undefined };
}
/** Options du sélecteur de périmètre : [valeur, libellé]. */
export function scopeOpts(c: Pick<OsCtx, 'me' | 'superuser'>): [string, string][] {
  const r = userScope(c);
  const o: [string, string][] = [];
  const pays = (k: Region) => PK.filter((p) => regOf(p) === k).map((p) => ['p:' + p, '   ' + pn(p)] as [string, string]);
  if (r.pays) o.push(['p:' + r.pays, pn(r.pays)]);
  else if (r.reg) { o.push(['r:' + r.reg, REGIONS[r.reg].n]); o.push(...pays(r.reg)); }
  else { o.push(['all', "Toute l'organisation"]); for (const k of Object.keys(REGIONS) as Region[]) { o.push(['r:' + k, REGIONS[k].n]); o.push(...pays(k)); } }
  return o;
}
export type ScopeState = { sc: string; scope: Scope; opts: [string, string][]; label: string; inScope: (row: { country?: string | null; domain?: string | string[] | null }) => boolean };
export function scopeState(c: Pick<OsCtx, 'me' | 'superuser'>, cookies: AstroCookies): ScopeState {
  const opts = scopeOpts(c);
  const want = cookies.get('os-scope')?.value ?? '';
  const sc = opts.some((o) => o[0] === want) ? want : opts[0][0];
  const scope = userScope(c);
  const base = sc === 'all' ? "toute l'organisation" : sc.startsWith('r:') ? REGIONS[sc.slice(2) as Region].n : pn(sc.slice(2));
  const label = scope.dom && scope.dom in DOM ? DOM[scope.dom as Dom].n + ' — ' + base : base;
  const inScope = (row: { country?: string | null; domain?: string | string[] | null }) => {
    if (scope.dom && row.domain != null) { const ds = Array.isArray(row.domain) ? row.domain : [row.domain]; if (!ds.includes(scope.dom)) return false; }
    if (!row.country) return true;
    if (sc === 'all') return true;
    if (sc.startsWith('r:')) return regOf(row.country) === sc.slice(2);
    if (sc.startsWith('p:')) return row.country === sc.slice(2);
    return true;
  };
  return { sc, scope, opts, label, inScope };
}
export { PAYS };
