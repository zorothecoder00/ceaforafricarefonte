/* Données ouvertes de l'Observatoire d'impact au format CSV (CDC §7.9). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { DATASETS } from '../../../data/impact';

export const getStaticPaths: GetStaticPaths = () => DATASETS.map((d) => ({ params: { id: d.id } }));

export const GET: APIRoute = ({ params }) => {
  const d = DATASETS.find((x) => x.id === params.id)!;
  return new Response(d.csv(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cea-impact-${d.id}.csv"` } });
};
