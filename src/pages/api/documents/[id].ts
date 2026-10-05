/* Téléchargement d'un document par l'équipe (CDC §12) : lecteur ou rédacteur du dossier ; ?v=<version> pour une version précédente. */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { docFile, docFolder, docVersion } from '../../../db/schema/workflows';
import { staffApi } from '../../../lib/admin';
import { canRead } from '../../../lib/documents';
import { serveVersion } from '../../../lib/doc-download';
import { clientIp } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params, url, request }) => {
  const u = staffApi(locals.user, 'documents', 'L');
  if (u instanceof Response) return u;
  const id = params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Introuvable', { status: 404 });
  const [row] = await db.select({ f: docFile, d: docFolder }).from(docFile).innerJoin(docFolder, eq(docFolder.id, docFile.folderId)).where(eq(docFile.id, id));
  if (!row || !canRead(row.d, u.roles)) return new Response('Introuvable', { status: 404 });
  const n = Number(url.searchParams.get('v')) || row.f.version;
  const [v] = await db.select().from(docVersion).where(and(eq(docVersion.fileId, id), eq(docVersion.version, n)));
  if (!v) return new Response('Version introuvable', { status: 404 });
  return serveVersion(v, row.f.name, { watermark: row.d.watermark, who: `${u.name} <${u.email}>`, fileId: id, userId: u.id, ip: clientIp(request) });
};
