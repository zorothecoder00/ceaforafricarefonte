/* Observatoire d'impact (CDC §7.9) : chaque indicateur a une définition, une source et une date d'arrêté.
   Ces jeux de données sont publiés en données ouvertes (CSV et JSON, licence CC BY 4.0). Données de démonstration. */
import { HUBS, country } from './site';

export const IMPACT_ASOF = '2026-09-30';
export const IMPACT_LICENSE = 'CC BY 4.0';

export type Kpi = { id: string; label: string; value: number; unit: string; display: string; definition: string; source: string; asOf: string };

export const KPIS: Kpi[] = [
  { id: 'entrepreneurs_formes', label: 'Entrepreneurs formés', value: 18420, unit: 'personnes', display: '18 420', definition: 'Personnes ayant terminé au moins un cours de CEA Academy (toutes leçons et quiz final validés).', source: 'Plateforme CEA Academy (certificats délivrés)', asOf: IMPACT_ASOF },
  { id: 'emplois_crees', label: 'Emplois créés', value: 2340, unit: 'emplois', display: '2 340', definition: 'Emplois en CDI ou CDD créés par les entreprises accompagnées, existant depuis au moins 6 mois, prouvés par contrat ou déclaration sociale, vérifiés par échantillonnage.', source: 'Déclarations des entreprises accompagnées, contrôle par échantillon', asOf: IMPACT_ASOF },
  { id: 'financements_obtenus', label: 'Financements obtenus', value: 9_800_000_000, unit: 'FCFA', display: '9,8 Md FCFA', definition: 'Montants de financement (dette, capital, subventions) clôturés par les entreprises accompagnées, vérifiés sur pièces.', source: 'Pipeline CEA Kapital Invest et déclarations vérifiées', asOf: IMPACT_ASOF },
  { id: 'part_femmes', label: 'Part de femmes', value: 46, unit: '%', display: '46 %', definition: 'Part des femmes parmi les entrepreneurs accompagnés dans un programme (déclaration volontaire, non-réponses exclues).', source: 'Formulaires de candidature aux programmes', asOf: IMPACT_ASOF },
];

export const JOBS_BY_QUARTER: [string, number][] = [['2025-T1', 120], ['2025-T2', 190], ['2025-T3', 260], ['2025-T4', 310], ['2026-T1', 380], ['2026-T2', 470], ['2026-T3', 610]];

export const BY_COUNTRY = HUBS.map((h) => ({ code: h.c, pays: country(h.c), membres: h.m, projets: h.p, evenements: h.e }));

const cell = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

/** Jeu de données « indicateurs » au format CSV (séparateur « ; », UTF-8 avec BOM pour Excel). */
export const kpisCsv = () => csv([['indicateur', 'libelle', 'valeur', 'unite', 'definition', 'source', 'date_arrete'], ...KPIS.map((k) => [k.id, k.label, k.value, k.unit, k.definition, k.source, k.asOf])]);
export const countriesCsv = () => csv([['code_pays', 'pays', 'membres', 'projets_accompagnes', 'evenements', 'date_arrete'], ...BY_COUNTRY.map((c) => [c.code, c.pays, c.membres, c.projets, c.evenements, IMPACT_ASOF])]);
export const jobsCsv = () => csv([['trimestre', 'emplois_crees', 'date_arrete'], ...JOBS_BY_QUARTER.map(([q, n]) => [q, n, IMPACT_ASOF])]);

export const DATASETS = [
  { id: 'indicateurs', title: 'Indicateurs clés', file: '/impact/donnees/indicateurs.csv', csv: kpisCsv },
  { id: 'pays', title: 'Membres, projets et événements par pays', file: '/impact/donnees/pays.csv', csv: countriesCsv },
  { id: 'emplois', title: 'Emplois créés par trimestre', file: '/impact/donnees/emplois.csv', csv: jobsCsv },
];
