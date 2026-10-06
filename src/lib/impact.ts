/* Observatoire d'impact (CDC §7.9) : indicateurs calculés à partir des données réelles des modules (Académie, programmes,
   CEA Talents, Kapital Invest, Events), filtrables par année, pays, secteur et genre.
   Garde-fou de réidentification : aucune cellule de moins de 10 personnes n'est publiée (valeur remplacée par « moins de 10 »).
   Genre : déclaration volontaire dans les candidatures aux programmes (« Femme » / « Homme ») ; les indicateurs qui ne
   portent pas sur des personnes identifiées (emplois déclarés par les employeurs) ne sont pas ventilés par genre. */
import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { country as countryName } from '../data/site';

export const MIN_CELL = 10;
export type ImpactFilters = { year?: number; country?: string; sector?: string; gender?: 'Femme' | 'Homme' };
export type ImpactKpi = { id: string; label: string; unit: string; value: number | null; display: string; definition: string; source: string; note?: string };
export type ImpactData = { asOf: string; filters: ImpactFilters; kpis: ImpactKpi[]; byCountry: { code: string; pays: string; membres: number | null }[]; jobsByQuarter: [string, number | null][] };

/** Valeur publiable : nulle (masquée) si elle concerne moins de MIN_CELL personnes. */
export const publishable = (value: number, people = value) => (people >= MIN_CELL ? value : null);
const nf = (n: number) => n.toLocaleString('fr-FR');
const money = (n: number) => (n >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md FCFA` : n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M FCFA` : `${nf(n)} FCFA`);
export const HIDDEN = 'moins de 10';

/** Conditions sur une colonne d'identifiant de personne : pays et secteur (profil), genre (candidatures). */
function people(col: string, f: ImpactFilters, withGender = true): SQL[] {
  const c = sql.raw(col);
  const out: SQL[] = [];
  if (f.country) out.push(sql`exists (select 1 from profile p where p.user_id = ${c} and p.country = ${f.country})`);
  if (f.sector) out.push(sql`exists (select 1 from profile p where p.user_id = ${c} and p.sector ilike ${f.sector})`);
  if (f.gender && withGender) out.push(sql`exists (select 1 from programme_application a where a.user_id = ${c} and a.data->>'genre' = ${f.gender})`);
  return out;
}
const yearIs = (expr: string, f: ImpactFilters) => (f.year ? [sql`extract(year from ${sql.raw(expr)}) = ${f.year}`] : []);
const where = (conds: SQL[]) => (conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``);
const one = async (q: SQL) => Number(((await db.execute(q)).rows[0] as Record<string, unknown> | undefined)?.n ?? 0);

const cache = new Map<string, { at: number; d: ImpactData }>();

export async function computeImpact(f: ImpactFilters = {}): Promise<ImpactData> {
  const key = JSON.stringify(f);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.d;

  // Entrepreneurs formés : au moins un cours de l'Académie terminé
  const trained = await one(sql`select count(distinct e.user_id) n from enrollment e ${where([sql`e.completed_at is not null`, ...yearIs('e.completed_at', f), ...people('e.user_id', f)])}`);
  // Entrepreneurs accompagnés : membres d'une cohorte de programme (hors abandon)
  const supported = await one(sql`select count(distinct m.user_id) n from cohort_member m ${where([sql`m.status <> 'abandon'`, ...yearIs('m.joined_at', f), ...people('m.user_id', f)])}`);
  // Emplois créés : embauches déclarées existant depuis au moins 6 mois et vérifiées (non ventilées par genre)
  const jobConds = [sql`h.verified_6m_at is not null`, ...yearIs('h.hired_on', f), ...(f.country ? [sql`h.country = ${f.country}`] : []), ...(f.sector ? [sql`exists (select 1 from profile p where p.user_id = h.employer_id and p.sector ilike ${f.sector})`] : [])];
  const jobs = f.gender ? null : await one(sql`select count(*) n from hire_declaration h ${where(jobConds)}`);
  // Financements obtenus : dossiers Kapital financés + derniers fonds levés déclarés par les anciens des programmes
  const fundDossiers = (await db.execute(sql`select count(*) n, coalesce(sum(d.amount_xof), 0) s from kapital.dossier d ${where([sql`d.status = 'finance'`, sql`d.amount_xof > 0`, ...yearIs('d.updated_at', f), ...(f.country ? [sql`d.country = ${f.country}`] : []), ...(f.sector ? [sql`d.sector ilike ${f.sector}`] : []), ...people('d.owner_id', { gender: f.gender })])}`)).rows[0] as { n: string; s: string };
  const fundAlumni = (await db.execute(sql`select count(*) n, coalesce(sum(x.funds_raised_xof), 0) s from (select distinct on (a.cohort_id, a.user_id) a.funds_raised_xof, a.user_id, a.recorded_at from alumni_followup a order by a.cohort_id, a.user_id, a.months_after desc) x ${where([sql`x.funds_raised_xof > 0`, ...yearIs('x.recorded_at', f), ...people('x.user_id', f)])}`)).rows[0] as { n: string; s: string };
  const fundN = Number(fundDossiers.n) + Number(fundAlumni.n), fundSum = Number(fundDossiers.s) + Number(fundAlumni.s);
  // Part de femmes : parmi les personnes admises dans un programme ayant déclaré leur genre
  const g = f.gender ? null : (await db.execute(sql`select count(distinct a.user_id) filter (where a.data->>'genre' = 'Femme') f, count(distinct a.user_id) t from programme_application a ${where([sql`a.status = 'admise'`, sql`a.data->>'genre' in ('Femme', 'Homme')`, ...yearIs('a.updated_at', f), ...people('a.user_id', { country: f.country, sector: f.sector })])}`)).rows[0] as { f: string; t: string };
  // Participants aux événements : billets contrôlés à l'entrée
  const attendees = await one(sql`select count(*) n from event_ticket t ${where([sql`t.checked_in_at is not null`, ...yearIs('t.checked_in_at', f), ...people('t.user_id', f)])}`);

  const kpi = (id: string, label: string, unit: string, value: number | null, display: (v: number) => string, definition: string, source: string, note?: string): ImpactKpi =>
    ({ id, label, unit, value, display: value == null ? (note ? '—' : HIDDEN) : display(value), definition, source, ...(note ? { note } : {}) });
  const womenPct = g && Number(g.t) >= MIN_CELL ? Math.round((Number(g.f) / Number(g.t)) * 100) : null;
  const kpis: ImpactKpi[] = [
    kpi('entrepreneurs_formes', 'Entrepreneurs formés', 'personnes', publishable(trained), nf, 'Personnes ayant terminé au moins un cours de CEA Academy (toutes leçons et quiz final validés).', 'CEA Academy (cours terminés)'),
    kpi('entrepreneurs_accompagnes', 'Entrepreneurs accompagnés', 'personnes', publishable(supported), nf, 'Membres d’une cohorte de programme (incubation, accélération…), abandons exclus.', 'Programmes et cohortes'),
    kpi('emplois_crees', 'Emplois créés', 'emplois', jobs == null ? null : publishable(jobs), nf, 'Embauches déclarées par les entreprises accompagnées, existant depuis au moins 6 mois et vérifiées par l’équipe (contrat ou déclaration sociale, contrôle par échantillon).', 'CEA Talents (déclarations d’embauche vérifiées)', f.gender ? 'Non ventilé par genre' : undefined),
    kpi('financements_obtenus', 'Financements obtenus', 'FCFA', publishable(fundSum, fundN), money, 'Financements clôturés par les dossiers CEA Kapital Invest (statut « financé ») et fonds levés déclarés par les anciens des programmes (dernier point de suivi).', 'CEA Kapital Invest et questionnaires de suivi des programmes'),
    kpi('part_femmes', 'Part de femmes', '%', womenPct, (v) => `${v} %`, 'Part des femmes parmi les personnes admises dans un programme ayant déclaré leur genre (déclaration volontaire, non-réponses exclues).', 'Candidatures aux programmes', f.gender ? 'Sans objet avec un filtre de genre' : undefined),
    kpi('participants_evenements', 'Participants aux événements', 'personnes', publishable(attendees), nf, 'Billets contrôlés à l’entrée des événements CEA (présentiel).', 'CEA Events (contrôle d’accès)'),
  ];

  // Membres par pays (profils), avec les filtres de secteur et de genre
  const rowsC = (await db.execute(sql`select p.country c, count(*) n from profile p ${where([sql`p.country is not null`, ...(f.country ? [sql`p.country = ${f.country}`] : []), ...(f.sector ? [sql`p.sector ilike ${f.sector}`] : []), ...(f.gender ? [sql`exists (select 1 from programme_application a where a.user_id = p.user_id and a.data->>'genre' = ${f.gender})`] : []), ...(f.year ? [sql`exists (select 1 from "user" u where u.id = p.user_id and extract(year from u.created_at) = ${f.year})`] : [])])} group by 1 order by 2 desc`)).rows as { c: string; n: string }[];
  const byCountry = rowsC.map((r) => ({ code: r.c, pays: countryName(r.c), membres: publishable(Number(r.n)) }));
  // Emplois créés par trimestre (embauches vérifiées)
  const rowsQ = f.gender ? [] : (await db.execute(sql`select to_char(h.hired_on, 'YYYY') || '-T' || to_char(h.hired_on, 'Q') q, count(*) n from hire_declaration h ${where(jobConds)} group by 1 order by 1`)).rows as { q: string; n: string }[];
  const jobsByQuarter = rowsQ.slice(-8).map((r) => [r.q, publishable(Number(r.n))] as [string, number | null]);

  const d: ImpactData = { asOf: new Date().toISOString().slice(0, 10), filters: f, kpis, byCountry, jobsByQuarter };
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), d });
  return d;
}

/** Valeurs proposées dans les filtres : années d'activité et secteurs renseignés dans les profils. */
export async function impactFilterOptions() {
  const sectors = ((await db.execute(sql`select distinct initcap(trim(sector)) s from profile where sector is not null and trim(sector) <> '' order by 1 limit 60`)).rows as { s: string }[]).map((r) => r.s);
  const first = 2024, now = new Date().getUTCFullYear();
  return { years: Array.from({ length: now - first + 1 }, (_, i) => now - i), sectors };
}

/** Lecture des filtres depuis l'adresse (?annee=2026&pays=TG&secteur=Agriculture&genre=Femme). */
export function readFilters(p: URLSearchParams): ImpactFilters {
  const year = Number(p.get('annee'));
  const c = p.get('pays')?.toUpperCase();
  const g = p.get('genre');
  const s = p.get('secteur')?.trim();
  return {
    ...(year >= 2000 && year <= 2100 ? { year } : {}),
    ...(c && /^[A-Z]{2}$/.test(c) ? { country: c } : {}),
    ...(s && s.length <= 60 ? { sector: s } : {}),
    ...(g === 'Femme' || g === 'Homme' ? { gender: g } : {}),
  };
}

const cell = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
const pub = (v: number | null) => (v == null ? HIDDEN : v);

/** Jeux de données ouverts (CSV « ; », UTF-8 avec BOM pour Excel), calculés à la demande. */
export const DATASETS: { id: string; title: string; file: string; csv: (d: ImpactData) => string }[] = [
  { id: 'indicateurs', title: 'Indicateurs clés', file: '/impact/donnees/indicateurs.csv', csv: (d) => csv([['indicateur', 'libelle', 'valeur', 'unite', 'definition', 'source', 'date_arrete'], ...d.kpis.map((k) => [k.id, k.label, pub(k.value), k.unit, k.definition, k.source, d.asOf])]) },
  { id: 'pays', title: 'Membres par pays', file: '/impact/donnees/pays.csv', csv: (d) => csv([['code_pays', 'pays', 'membres', 'date_arrete'], ...d.byCountry.map((c) => [c.code, c.pays, pub(c.membres), d.asOf])]) },
  { id: 'emplois', title: 'Emplois créés par trimestre', file: '/impact/donnees/emplois.csv', csv: (d) => csv([['trimestre', 'emplois_crees', 'date_arrete'], ...d.jobsByQuarter.map(([q, n]) => [q, pub(n), d.asOf])]) },
];
