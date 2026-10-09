/* CEA OS — consultation d'un document (contrôle du niveau de confidentialité, consultation journalisée).
   GET ?id=<document>[&v=<version>][&dl=1] : version courante par défaut ; dl=1 pour télécharger. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDocument } from '../../../../db/schema/os';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { canSeeDoc } from '../../../../lib/os/support';
import { contentOf } from '../../../../lib/os/documents';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const id = url.searchParams.get('id') ?? '';
  const [d] = /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(osDocument).where(eq(osDocument.id, id)) : [];
  if (!d) return fail('Document introuvable.', 404);
  if (!canSeeDoc(d, c)) return fail('Accès restreint.', 403);
  const v = Number(url.searchParams.get('v')) || undefined;
  const f = await contentOf(d, v);
  if (!f) return fail('Fichier indisponible.', 404);
  await audit(locals.user!.id, 'os.document.consultation', d.name, { version: f.version });
  return new Response(Buffer.from(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `${url.searchParams.get('dl') ? 'attachment' : 'inline'}; filename="${f.filename}"`, 'Cache-Control': 'private, no-store' } });
};
