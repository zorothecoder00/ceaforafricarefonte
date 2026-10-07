/* CEA OS — CV d'un candidat (profils dg et rh). GET ?id=<candidature> ; consultation journalisée. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osCandidate } from '../../../../db/schema/os';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { readStoredFile } from '../../../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user, 'dg rh');
  if (c instanceof Response) return c;
  const id = url.searchParams.get('id') ?? '';
  const [k] = /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(osCandidate).where(eq(osCandidate.id, id)) : [];
  if (!k?.cv) return fail('CV introuvable.', 404);
  const f = await readStoredFile(k.cv.key);
  if (!f) return fail('Fichier indisponible.', 404);
  await audit(locals.user!.id, 'os.recrutement.cv', k.recruitId, { candidat: k.name });
  return new Response(Buffer.from(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${k.cv.name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store' } });
};
