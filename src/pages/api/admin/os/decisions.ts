/* CEA OS — registre des décisions : la Direction générale tranche les décisions issues des réunions.
   POST { id, ok: true|false } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDecision } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';

export const prerender = false;

const Body = z.object({ id: z.uuid(), ok: z.preprocess((v) => (v === 'false' ? false : v === 'true' ? true : v), z.boolean()) });

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, 'dg', true);
  if (c instanceof Response) return c;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const [d] = await db.update(osDecision).set({ status: p.data.ok ? 'Décidé' : 'Refusé' }).where(and(eq(osDecision.id, p.data.id), eq(osDecision.status, 'En attente'))).returning();
  if (!d) return fail('Décision introuvable ou déjà tranchée.', 404);
  await audit(locals.user!.id, 'os.decision', d.id, { statut: d.status });
  return json({ ok: true, message: `Décision : ${d.status.toLowerCase()}.` });
};
