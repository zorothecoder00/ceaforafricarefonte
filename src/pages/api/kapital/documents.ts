/* Dépôt d'un document dans la data room (multipart : dossierId, folder, file) — propriétaire du dossier ou analyste assigné. */
import type { APIRoute } from 'astro';
import { and, eq, max } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, dataRoomDocument, dataRoomFolderEnum } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { storeFile } from '../../../lib/storage';
import { hasRole } from '../../../lib/rbac';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const form = await request.formData().catch(() => null);
  const dossierId = String(form?.get('dossierId') ?? ''), folder = String(form?.get('folder') ?? '');
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return fail('Choisissez un fichier.');
  if (!(dataRoomFolderEnum.enumValues as readonly string[]).includes(folder)) return fail('Dossier de la data room inconnu.');
  const [d] = await db.select().from(dossier).where(eq(dossier.id, dossierId));
  if (!d) return fail('Dossier introuvable.', 404);
  if (d.ownerId !== u.id && !(d.analystId === u.id && hasRole(u.roles, 'analyste'))) return fail('Accès refusé.', 403);
  let stored;
  try {
    stored = await storeFile(file, `dataroom/${d.id}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Dépôt impossible.');
  }
  const name = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 140) || 'document';
  const [{ v }] = await db.select({ v: max(dataRoomDocument.version) }).from(dataRoomDocument).where(and(eq(dataRoomDocument.dossierId, d.id), eq(dataRoomDocument.name, name)));
  await db.insert(dataRoomDocument).values({ dossierId: d.id, folder: folder as 'juridique', name, storageKey: stored.key, version: (v ?? 0) + 1, uploadedBy: u.id });
  await audit(u.id, 'kapital.dataroom.depot', d.reference, { name, folder, size: stored.size }, clientIp(request));
  return json({ ok: true, message: `« ${name} » ajouté à la data room${v ? ` (version ${v + 1})` : ''}.` });
};
