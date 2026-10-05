/* Téléchargement d'une version de document (CDC §12) : filigrane nominatif sur les PDF des dossiers qui l'exigent, journal.
   Utilisé par le téléchargement de l'équipe et par les liens de partage. */
import { db } from './db';
import { docLog } from '../db/schema/workflows';
import { readStoredFile } from './storage';
import { watermarkPdf, watermarkText } from './documents';

export async function serveVersion(v: { storageKey: string; mime: string; version: number }, name: string, o: { watermark: boolean; who: string; fileId: string; userId?: string | null; shareId?: string | null; ip?: string | null }) {
  const f = await readStoredFile(v.storageKey);
  if (!f) return new Response('Fichier indisponible.', { status: 404 });
  let body = f.body;
  if (o.watermark && v.mime === 'application/pdf') {
    try { body = await watermarkPdf(f.body, watermarkText(o.who)); }
    catch { return new Response('Ce PDF ne peut pas recevoir de filigrane (fichier protégé ?) : téléchargement refusé. Contactez l’équipe CEA.', { status: 422 }); }
  }
  await db.insert(docLog).values({ fileId: o.fileId, userId: o.userId ?? null, shareId: o.shareId ?? null, ip: o.ip ?? null, action: 'telechargement', detail: `v${v.version}${o.watermark && v.mime === 'application/pdf' ? ' · filigrane' : ''} · ${o.who}` });
  const safeName = name.replace(/[^\w.\- ]+/g, '_').slice(0, 150);
  return new Response(body as BodyInit, { headers: { 'Content-Type': v.mime, 'Content-Disposition': `attachment; filename="${safeName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
