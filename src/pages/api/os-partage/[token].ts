/* CEA OS — lien de partage sécurisé d'un document (sans compte) : valable jusqu'à sa date d'expiration ; chaque ouverture
   est journalisée. GET /api/os-partage/<jeton> */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { osDocShare, osDocument } from '../../../db/schema/os';
import { audit, clientIp } from '../../../lib/session';
import { readStoredFile } from '../../../lib/storage';

export const prerender = false;

const page = (msg: string, status: number) => new Response(`<!doctype html><meta charset="utf-8"><title>CEA FOR AFRICA</title><p style="font-family:sans-serif;padding:24px">${msg}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export const GET: APIRoute = async ({ params, request }) => {
  const [s] = await db.select().from(osDocShare).where(eq(osDocShare.token, params.token ?? ''));
  if (!s) return page('Lien inconnu.', 404);
  if (s.expiresAt < new Date()) return page('Ce lien de partage a expiré. Demandez un nouveau lien à votre contact CEA FOR AFRICA.', 410);
  const [d] = await db.select().from(osDocument).where(eq(osDocument.id, s.documentId));
  const f = d ? await readStoredFile(d.storageKey) : null;
  if (!d || !f) return page('Document indisponible.', 404);
  await audit(null, 'os.document.partage.ouverture', d.name, { destinataire: s.email }, clientIp(request));
  return new Response(Buffer.from(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${d.name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
};
