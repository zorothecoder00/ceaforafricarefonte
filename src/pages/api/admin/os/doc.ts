/* CEA OS — consultation d'un document (contrôle du niveau de confidentialité, consultation journalisée). GET ?id=<document> */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDocument } from '../../../../db/schema/os';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { canSeeDoc } from '../../../../lib/os/support';
import { readStoredFile } from '../../../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const id = url.searchParams.get('id') ?? '';
  const [d] = /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(osDocument).where(eq(osDocument.id, id)) : [];
  if (!d) return fail('Document introuvable.', 404);
  if (!canSeeDoc(d, c)) return fail('Accès restreint.', 403);
  const f = await readStoredFile(d.storageKey);
  if (!f) return fail('Fichier indisponible.', 404);
  await audit(locals.user!.id, 'os.document.consultation', d.name, { version: d.version });
  return new Response(Buffer.from(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${d.name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store' } });
};
