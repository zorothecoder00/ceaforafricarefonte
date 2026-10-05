/* Médiathèque du CMS (CDC §12) : dépôt d'images publiques (PNG, JPG, WEBP), texte alternatif obligatoire.
   POST multipart { file, alt, credit? } → { ok, id, url } ; PATCH { id, alt, credit } ; DELETE { id } (si l'image n'est utilisée nulle part). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { cmsContent, cmsMedia } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { storeFile } from '../../../lib/storage';
import { mediaUrl } from '../../../lib/cms';

export const prerender = false;
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'contenus', 'C');
  if (u instanceof Response) return u;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const alt = String(form?.get('alt') ?? '').trim();
  const credit = String(form?.get('credit') ?? '').trim();
  if (!(file instanceof File) || !file.size) return fail('Choisissez une image.');
  if (!IMAGES.has(file.type)) return fail('Formats acceptés : PNG, JPG, WEBP.');
  if (alt.length < 3 || alt.length > 250) return fail('Décrivez l’image en quelques mots (texte alternatif, pour l’accessibilité).');
  let stored;
  try { stored = await storeFile(file, 'cms'); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
  const [m] = await db.insert(cmsMedia).values({ storageKey: stored.key, mime: stored.type, size: stored.size, name: file.name.slice(0, 200), alt, credit: credit.slice(0, 200) || null, uploadedBy: u.id }).returning();
  await audit(u.id, 'cms.media.depot', m.id, { name: m.name, size: m.size }, clientIp(request));
  return json({ ok: true, id: m.id, url: mediaUrl(m.id), message: 'Image ajoutée.' });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'contenus', 'M');
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid(), alt: z.string().trim().min(3).max(250), credit: z.string().trim().max(200).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Texte alternatif requis (3 caractères minimum).');
  await db.update(cmsMedia).set({ alt: p.data.alt, credit: p.data.credit || null }).where(eq(cmsMedia.id, p.data.id));
  return json({ ok: true, message: 'Enregistré.' });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'contenus', 'V');
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  // Utilisée en couverture ou dans un bloc image ?
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(cmsContent)
    .where(sql`${cmsContent.coverId} = ${p.data.id} or ${cmsContent.blocks}::text like ${'%' + p.data.id + '%'}`);
  if (used?.n) return fail(`Image utilisée dans ${used.n} contenu${used.n > 1 ? 's' : ''} : retirez-la d'abord.`);
  await db.delete(cmsMedia).where(eq(cmsMedia.id, p.data.id));
  await audit(u.id, 'cms.media.suppression', p.data.id, {}, clientIp(request));
  return json({ ok: true, message: 'Image supprimée.' });
};
