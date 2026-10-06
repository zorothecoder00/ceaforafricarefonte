/* API publique v1 — données d'impact ouvertes (CDC §7.9, §13.2), licence CC BY 4.0.
   GET ?pays=TG&annee=2026&secteur=…&genre=Femme|Homme ; valeur null = moins de 10 personnes (non publiée). */
import type { APIRoute } from 'astro';
import { computeImpact, readFilters, MIN_CELL } from '../../../lib/impact';
import { ok, error, limited, preflight } from '../../../lib/public-api';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const pays = url.searchParams.get('pays');
  if (pays && !/^[A-Za-z]{2}$/.test(pays)) return error(400, 'parametre_invalide', 'pays : code ISO 3166-1 alpha-2 (ex. TG).');
  const d = await computeImpact(readFilters(url.searchParams));
  return ok({
    indicateurs: d.kpis.map((k) => ({ id: k.id, libelle: k.label, valeur: k.value, unite: k.unit, definition: k.definition, source: k.source, ...(k.note ? { remarque: k.note } : {}) })),
    emplois_par_trimestre: d.jobsByQuarter.map(([trimestre, emplois]) => ({ trimestre, emplois })),
    pays: d.byCountry,
  }, { source: 'CEA FOR AFRICA — Observatoire d’impact', licence: 'CC BY 4.0', date_arrete: d.asOf, filtres: d.filters, regle_publication: `null = moins de ${MIN_CELL} personnes` }, 600);
};
export const OPTIONS: APIRoute = preflight;
