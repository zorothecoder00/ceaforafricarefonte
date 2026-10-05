/* API publique pour les partenaires (CDC §13.2) : lecture seule, sans authentification, versionnée (/api/v1), documentée (OpenAPI).
   Réponses : { data, meta } ; erreurs : { error: { code, message } } ; CORS ouvert ; cache public court ; limite de débit par adresse IP.
   Seules des données déjà publiques sont exposées (aucune donnée personnelle). */
import { rateLimit } from './guard';

export const API_VERSION = '1.0.0';
export const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-API-Version': API_VERSION,
};

export function ok(data: unknown, meta: Record<string, unknown> = {}, maxAge = 300) {
  return new Response(JSON.stringify({ data, meta: { version: API_VERSION, generated_at: new Date().toISOString(), ...meta } }), {
    headers: { ...HEADERS, 'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}` },
  });
}
export function error(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
}
/** Limite de débit : 120 requêtes par minute et par adresse IP. */
export function limited(request: Request) {
  const r = rateLimit(request, 'api-v1', 120, 60);
  return r ? error(429, 'trop_de_requetes', 'Limite de 120 requêtes par minute atteinte. Réessayez dans une minute.') : null;
}
export const preflight = () => new Response(null, { status: 204, headers: { ...HEADERS, 'Access-Control-Max-Age': '86400' } });

/** Pagination : ?limite (1 à 100, 50 par défaut) et ?page (à partir de 1). */
export function paginate<T>(list: T[], url: URL) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limite')) || 50));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  return { items: list.slice((page - 1) * limit, page * limit), meta: { total: list.length, page, limite: limit, pages: Math.max(1, Math.ceil(list.length / limit)) } };
}
