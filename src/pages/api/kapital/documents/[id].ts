/* Lecture d'un document de data room : contrôle d'accès (NDA actif, propriétaire ou équipe), affichage en ligne uniquement. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { dataRoomDocument } from '../../../../db/schema/kapital';
import { accessLevel } from '../../../../lib/kapital';
import { readStoredFile } from '../../../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const u = locals.user;
  if (!u) return new Response('Connexion requise', { status: 401 });
  const [doc] = await db.select().from(dataRoomDocument).where(eq(dataRoomDocument.id, params.id ?? ''));
  if (!doc) return new Response('Introuvable', { status: 404 });
  const level = await accessLevel(u.id, doc.dossierId);
  if (!['dataroom', 'proprietaire', 'equipe'].includes(level)) return new Response('Accès refusé', { status: 403 });
  const f = await readStoredFile(doc.storageKey);
  if (!f) return new Response('Fichier indisponible', { status: 404 });
  return new Response(f.body as unknown as BodyInit, {
    headers: {
      'Content-Type': f.type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
};
