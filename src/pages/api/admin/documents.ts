/* Gestion documentaire (CDC §12) — classement, droits par dossier, partage. Droits : objet « documents » (§18) et rôles du dossier.
   POST { action, … } :
   - folder.save { id?, name, parentId?, readers, writers, watermark } · folder.delete { id } (dossier vide) → administrateur
   - file.update { id, name, tags, folderId }  · file.archive { id, archived } → rédacteur du dossier (et du dossier cible)
   - share.create { fileId, recipient, days, maxDownloads? } · share.revoke { id } → rédacteur du dossier
   Chaque action est inscrite au journal du document (doc_log) et au journal d'audit. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { docFolder, docFile, docShare, docLog } from '../../../db/schema/workflows';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { ROLES } from '../../../lib/rbac';
import { canWrite, isDocAdmin, shareToken } from '../../../lib/documents';
import { siteUrl } from '../../../lib/campaigns';

export const prerender = false;

const id = z.uuid();
const Role = z.enum(ROLES);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('folder.save'), id: id.optional(), name: z.string().trim().min(2).max(120), parentId: z.preprocess((v) => (v === '' ? null : v), id.nullish()), readers: z.array(Role).max(20), writers: z.array(Role).max(20), watermark: z.boolean() }),
  z.object({ action: z.literal('folder.delete'), id }),
  z.object({ action: z.literal('file.update'), id, name: z.string().trim().min(1).max(200), tags: z.array(z.string().trim().min(1).max(40)).max(15), folderId: id }),
  z.object({ action: z.literal('file.archive'), id, archived: z.boolean() }),
  z.object({ action: z.literal('share.create'), fileId: id, recipient: z.string().trim().min(2).max(160), days: z.coerce.number().int().min(1).max(30), maxDownloads: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1).max(100).nullable()) }),
  z.object({ action: z.literal('share.revoke'), id }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  const b = p.data;
  const u = staffApi(locals.user, 'documents', 'L');
  if (u instanceof Response) return u;
  const ip = clientIp(request);
  const log = (v: Partial<typeof docLog.$inferInsert> & { action: string }) => db.insert(docLog).values({ userId: u.id, ip, ...v });
  const folderOf = async (fid: string) => (await db.select().from(docFolder).where(eq(docFolder.id, fid)))[0];
  const fileWithFolder = async (fid: string) => (await db.select({ f: docFile, d: docFolder }).from(docFile).innerJoin(docFolder, eq(docFolder.id, docFile.folderId)).where(eq(docFile.id, fid)))[0];

  switch (b.action) {
    case 'folder.save': {
      if (!isDocAdmin(u.roles)) return fail('Seul un administrateur crée ou modifie les dossiers et leurs droits.', 403);
      if (b.parentId && (b.parentId === b.id || !(await folderOf(b.parentId)))) return fail('Dossier parent invalide.');
      const v = { name: b.name, parentId: b.parentId ?? null, readers: b.readers, writers: b.writers, watermark: b.watermark };
      if (b.id) await db.update(docFolder).set(v).where(eq(docFolder.id, b.id));
      else { const [n] = await db.insert(docFolder).values({ ...v, createdBy: u.id }).returning({ id: docFolder.id }); b.id = n.id; }
      await log({ folderId: b.id, action: 'droits', detail: `lecture : ${b.readers.join(', ') || '—'} · dépôt : ${b.writers.join(', ') || '—'}` });
      await audit(u.id, 'documents.dossier', b.id, v, ip);
      return json({ ok: true, message: 'Dossier enregistré.', redirect: `/admin/documents?dossier=${b.id}` });
    }
    case 'folder.delete': {
      if (!isDocAdmin(u.roles)) return fail('Réservé à un administrateur.', 403);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(docFile).where(eq(docFile.folderId, b.id));
      const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(docFolder).where(eq(docFolder.parentId, b.id));
      if (n || c) return fail('Le dossier n’est pas vide.');
      await db.delete(docFolder).where(eq(docFolder.id, b.id));
      await audit(u.id, 'documents.dossier.suppression', b.id, {}, ip);
      return json({ ok: true, message: 'Dossier supprimé.', redirect: '/admin/documents' });
    }
    case 'file.update': {
      const row = await fileWithFolder(b.id);
      const target = await folderOf(b.folderId);
      if (!row || !target) return fail('Document introuvable.', 404);
      if (!canWrite(row.d, u.roles) || !canWrite(target, u.roles)) return fail('Droits insuffisants sur ce dossier.', 403);
      await db.update(docFile).set({ name: b.name, tags: b.tags, folderId: b.folderId, updatedAt: new Date() }).where(eq(docFile.id, b.id));
      await log({ fileId: b.id, action: row.f.folderId !== b.folderId ? 'deplacement' : 'classement', detail: row.f.folderId !== b.folderId ? `vers « ${target.name} »` : b.name });
      return json({ ok: true, message: 'Document enregistré.' });
    }
    case 'file.archive': {
      const row = await fileWithFolder(b.id);
      if (!row) return fail('Document introuvable.', 404);
      if (!canWrite(row.d, u.roles)) return fail('Droits insuffisants sur ce dossier.', 403);
      await db.update(docFile).set({ archived: b.archived, updatedAt: new Date() }).where(eq(docFile.id, b.id));
      if (b.archived) await db.update(docShare).set({ revokedAt: new Date() }).where(and(eq(docShare.fileId, b.id), sql`${docShare.revokedAt} is null`));
      await log({ fileId: b.id, action: b.archived ? 'archivage' : 'restauration' });
      return json({ ok: true, message: b.archived ? 'Document archivé (liens de partage révoqués).' : 'Document restauré.' });
    }
    case 'share.create': {
      const row = await fileWithFolder(b.fileId);
      if (!row || row.f.archived) return fail('Document introuvable.', 404);
      if (!canWrite(row.d, u.roles)) return fail('Seuls les rédacteurs du dossier partagent ses documents.', 403);
      const token = shareToken();
      const expiresAt = new Date(Date.now() + b.days * 864e5);
      const [s] = await db.insert(docShare).values({ fileId: b.fileId, token, recipient: b.recipient, expiresAt, maxDownloads: b.maxDownloads, createdBy: u.id }).returning({ id: docShare.id });
      await log({ fileId: b.fileId, shareId: s.id, action: 'partage', detail: `${b.recipient} · jusqu'au ${expiresAt.toLocaleDateString('fr-FR')}${b.maxDownloads ? ` · ${b.maxDownloads} téléchargement(s)` : ''}` });
      await audit(u.id, 'documents.partage', b.fileId, { recipient: b.recipient, days: b.days }, ip);
      return json({ ok: true, url: `${siteUrl()}/partage/${token}`, message: 'Lien de partage créé.' });
    }
    case 'share.revoke': {
      const [s] = await db.select({ s: docShare, d: docFolder }).from(docShare).innerJoin(docFile, eq(docFile.id, docShare.fileId)).innerJoin(docFolder, eq(docFolder.id, docFile.folderId)).where(eq(docShare.id, b.id));
      if (!s) return fail('Lien introuvable.', 404);
      if (!canWrite(s.d, u.roles)) return fail('Droits insuffisants.', 403);
      await db.update(docShare).set({ revokedAt: new Date() }).where(eq(docShare.id, b.id));
      await log({ fileId: s.s.fileId, shareId: b.id, action: 'revocation', detail: s.s.recipient });
      return json({ ok: true, message: 'Lien révoqué.' });
    }
  }
};
