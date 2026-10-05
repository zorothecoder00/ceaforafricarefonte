/* API publique v1 — données d'impact ouvertes (CDC §7.9, §13.2), licence CC BY 4.0. GET ?pays=TG */
import type { APIRoute } from 'astro';
import { KPIS, JOBS_BY_QUARTER, BY_COUNTRY, IMPACT_ASOF, IMPACT_LICENSE } from '../../../data/impact';
import { ok, error, limited, preflight } from '../../../lib/public-api';

export const prerender = false;

export const GET: APIRoute = ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const pays = url.searchParams.get('pays')?.toUpperCase();
  if (pays && !/^[A-Z]{2}$/.test(pays)) return error(400, 'parametre_invalide', 'pays : code ISO 3166-1 alpha-2 (ex. TG).');
  return ok({
    indicateurs: KPIS.map(({ id, label, value, unit, definition, source, asOf }) => ({ id, libelle: label, valeur: value, unite: unit, definition, source, date_arrete: asOf })),
    emplois_par_trimestre: JOBS_BY_QUARTER.map(([trimestre, emplois]) => ({ trimestre, emplois })),
    pays: pays ? BY_COUNTRY.filter((c) => c.code === pays) : BY_COUNTRY,
  }, { source: 'CEA FOR AFRICA — Observatoire d’impact', licence: IMPACT_LICENSE, date_arrete: IMPACT_ASOF }, 3600);
};
export const OPTIONS: APIRoute = preflight;
