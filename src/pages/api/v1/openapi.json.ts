/* Spécification OpenAPI 3.1 de l'API publique v1 (CDC §13). */
import type { APIRoute } from 'astro';
import { OPENAPI } from '../../../lib/openapi';
import { HEADERS } from '../../../lib/public-api';

export const prerender = false;
export const GET: APIRoute = ({ url }) => new Response(JSON.stringify({ ...OPENAPI, servers: [{ url: `${url.origin}/api/v1`, description: 'Version 1' }] }, null, 2), { headers: { ...HEADERS, 'Cache-Control': 'public, max-age=3600' } });
