/* CEA OS — justificatif d'une demande (note de frais, dépense) : visible par le demandeur, ses approbateurs, la finance
   et la direction. GET ?id=NDF-XXXXX */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osRequest } from '../../../../db/schema/os';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { activeDelegations, approverOf } from '../../../../lib/os/approvals';
import { allStaff } from '../../../../lib/os/core';
import { readStoredFile } from '../../../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const [r] = await db.select().from(osRequest).where(eq(osRequest.id, url.searchParams.get('id') ?? ''));
  const just = r?.data.just as { key: string; name: string } | undefined;
  if (!r || !just) return fail('Justificatif introuvable.', 404);
  const [people, delegs] = await Promise.all([allStaff(), activeDelegations()]);
  const meId = c.me?.id;
  const ok = c.superuser || meId === r.byStaff || ['dg', 'fin'].includes(c.prof ?? '') || (meId && r.steps.some((s) => approverOf(s.l, r, people, delegs).includes(meId)));
  if (!ok) return fail('Accès refusé.', 403);
  const f = await readStoredFile(just.key);
  if (!f) return fail('Fichier indisponible.', 404);
  await audit(locals.user!.id, 'os.justificatif.consultation', r.id);
  return new Response(Buffer.from(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${just.name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store' } });
};
