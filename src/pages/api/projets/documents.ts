/* Documents d'un projet avec versions (multipart : projectId, file). */
import type { APIRoute } from 'astro';
import { and, eq, max } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { projectDoc } from '../../../db/schema/app';
import { json, fail, requireUser } from '../../../lib/session';
import { storeFile } from '../../../lib/storage';
import { projectRole, canEdit } from '../../../lib/projects';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const f = await request.formData().catch(() => null);
  const projectId = String(f?.get('projectId') ?? '');
  const file = f?.get('file');
  if (!(file instanceof File) || !file.size) return fail('Choisissez un fichier.');
  if (!canEdit(await projectRole(u, projectId))) return fail('Accès refusé.', 403);
  let stored;
  try { stored = await storeFile(file, `projets/${projectId}`); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
  const name = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 140) || 'document';
  const [{ v }] = await db.select({ v: max(projectDoc.version) }).from(projectDoc).where(and(eq(projectDoc.projectId, projectId), eq(projectDoc.name, name)));
  await db.insert(projectDoc).values({ projectId, name, storageKey: stored.key, version: (v ?? 0) + 1, uploadedBy: u.id });
  return json({ ok: true, message: `Document ajouté${v ? ` (version ${v + 1})` : ''}.` });
};
