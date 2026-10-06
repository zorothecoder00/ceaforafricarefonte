/* API publique de l'Observatoire d'impact (CDC §7.9, §13) : lecture seule, sans authentification, appelable depuis n'importe quel site.
   GET /api/ouvert/impact                         → indicateurs, emplois par trimestre, membres par pays
   GET /api/ouvert/impact?pays=TG&annee=2026      → mêmes données filtrées (pays ISO 3166-1 alpha-2, année, secteur, genre)
   Valeurs calculées à partir des données de la plateforme ; « null » = moins de 10 personnes (non publié). */
import type { APIRoute } from 'astro';
import { computeImpact, readFilters, MIN_CELL } from '../../../lib/impact';

export const prerender = false;

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };

export const GET: APIRoute = async ({ url }) => {
  const pays = url.searchParams.get('pays');
  if (pays && !/^[A-Za-z]{2}$/.test(pays)) return new Response(JSON.stringify({ error: 'Paramètre « pays » invalide (code ISO à 2 lettres).' }), { status: 400, headers });
  const d = await computeImpact(readFilters(url.searchParams));
  const body = {
    source: 'CEA FOR AFRICA — Observatoire d’impact',
    licence: 'CC BY 4.0',
    date_arrete: d.asOf,
    filtres: d.filters,
    regle_publication: `Valeur null : moins de ${MIN_CELL} personnes concernées (non publiée).`,
    indicateurs: d.kpis.map((k) => ({ id: k.id, libelle: k.label, valeur: k.value, unite: k.unit, definition: k.definition, source: k.source, ...(k.note ? { remarque: k.note } : {}) })),
    emplois_par_trimestre: d.jobsByQuarter.map(([trimestre, emplois]) => ({ trimestre, emplois })),
    pays: d.byCountry,
  };
  return new Response(JSON.stringify(body), { headers });
};

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
