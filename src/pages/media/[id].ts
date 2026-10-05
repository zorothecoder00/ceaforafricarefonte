/* Diffusion des images de la médiathèque du CMS (publiques, mises en cache longtemps : une image ne change jamais d'identifiant). */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { cmsMedia } from '../../db/schema/app';
import { readStoredFile } from '../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Introuvable', { status: 404 });
  const [m] = await db.select().from(cmsMedia).where(eq(cmsMedia.id, id));
  const f = m ? await readStoredFile(m.storageKey) : null;
  if (!m || !f) return new Response('Introuvable', { status: 404 });
  return new Response(f.body as BodyInit, { headers: { 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
};
