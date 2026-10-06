/* Données ouvertes de l'Observatoire d'impact au format CSV (CDC §7.9), calculées à la demande (mêmes règles que la page). */
import type { APIRoute } from 'astro';
import { computeImpact, DATASETS } from '../../../lib/impact';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const d = DATASETS.find((x) => x.id === params.id);
  if (!d) return new Response('Jeu de données inconnu.', { status: 404 });
  return new Response(d.csv(await computeImpact()), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cea-impact-${d.id}.csv"`, 'Cache-Control': 'public, max-age=600' } });
};
