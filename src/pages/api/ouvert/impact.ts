/* API publique de l'Observatoire d'impact (CDC §7.9, §13) : lecture seule, sans authentification, appelable depuis n'importe quel site.
   GET /api/ouvert/impact            → indicateurs, emplois par trimestre, données par pays
   GET /api/ouvert/impact?pays=TG    → filtrage des données par pays (code ISO 3166-1 alpha-2) */
import type { APIRoute } from 'astro';
import { KPIS, JOBS_BY_QUARTER, BY_COUNTRY, IMPACT_ASOF, IMPACT_LICENSE } from '../../../data/impact';

export const prerender = false;

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' };

export const GET: APIRoute = ({ url }) => {
  const pays = url.searchParams.get('pays')?.toUpperCase();
  if (pays && !/^[A-Z]{2}$/.test(pays)) return new Response(JSON.stringify({ error: 'Paramètre « pays » invalide (code ISO à 2 lettres).' }), { status: 400, headers });
  const body = {
    source: 'CEA FOR AFRICA — Observatoire d’impact',
    licence: IMPACT_LICENSE,
    date_arrete: IMPACT_ASOF,
    indicateurs: KPIS.map(({ id, label, value, unit, definition, source, asOf }) => ({ id, libelle: label, valeur: value, unite: unit, definition, source, date_arrete: asOf })),
    emplois_par_trimestre: JOBS_BY_QUARTER.map(([trimestre, emplois]) => ({ trimestre, emplois })),
    pays: pays ? BY_COUNTRY.filter((c) => c.code === pays) : BY_COUNTRY,
  };
  return new Response(JSON.stringify(body), { headers });
};

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
