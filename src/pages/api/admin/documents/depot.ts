/* Dépôt d'un document ou d'une nouvelle version (CDC §12, gestion documentaire) : contrôle du format et du contenu, analyse antivirus
   (point d'intégration de src/lib/storage.ts), stockage chiffré. Réservé aux rédacteurs du dossier.
   POST multipart { folderId, fileId?, file, note? } */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { docFolder, docFile, docVersion, docLog } from '../../../../db/schema/workflows';
import { json, fail, audit, clientIp } from '../../../../lib/session';
import { staffApi } from '../../../../lib/admin';
import { canWrite } from '../../../../lib/documents';
import { storeFile } from '../../../../lib/storage';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'documents', 'L');
  if (u instanceof Response) return u;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const folderId = String(form?.get('folderId') ?? '');
  const fileId = String(form?.get('fileId') ?? '');
  const note = String(form?.get('note') ?? '').trim().slice(0, 300) || null;
  if (!(file instanceof File) || !file.size) return fail('Choisissez un fichier.');
  const [folder] = /^[0-9a-f-]{36}$/.test(folderId) ? await db.select().from(docFolder).where(eq(docFolder.id, folderId)) : [];
  if (!folder) return fail('Dossier introuvable.', 404);
  if (!canWrite(folder, u.roles)) return fail('Vous ne pouvez pas déposer dans ce dossier.', 403);
  const [existing] = fileId ? await db.select().from(docFile).where(and(eq(docFile.id, fileId), eq(docFile.folderId, folderId))) : [];
  if (fileId && !existing) return fail('Document introuvable dans ce dossier.', 404);
  let stored;
  try { stored = await storeFile(file, `ged/${folderId}`); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
  const ip = clientIp(request);
  if (existing) {
    const version = existing.version + 1;
    await db.insert(docVersion).values({ fileId: existing.id, version, storageKey: stored.key, mime: stored.type, size: stored.size, note, uploadedBy: u.id });
    await db.update(docFile).set({ version, updatedAt: new Date() }).where(eq(docFile.id, existing.id));
    await db.insert(docLog).values({ fileId: existing.id, userId: u.id, ip, action: 'version', detail: `v${version}${note ? ` — ${note}` : ''}` });
    await audit(u.id, 'documents.version', existing.id, { version }, ip);
    return json({ ok: true, message: `Version ${version} déposée.` });
  }
  const [n] = await db.insert(docFile).values({ folderId, name: file.name.slice(0, 200), createdBy: u.id }).returning({ id: docFile.id });
  await db.insert(docVersion).values({ fileId: n.id, version: 1, storageKey: stored.key, mime: stored.type, size: stored.size, note, uploadedBy: u.id });
  await db.insert(docLog).values({ fileId: n.id, userId: u.id, ip, action: 'depot', detail: file.name.slice(0, 200) });
  await audit(u.id, 'documents.depot', n.id, { folder: folderId }, ip);
  return json({ ok: true, message: 'Document déposé.' });
};
