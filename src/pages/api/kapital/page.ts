/* Constructeur de page d'opportunité (CDC §8.8) : l'entreprise enregistre la page de son dossier.
   PUT { dossierId, page } → page validée (src/lib/opportunity-page.ts) et enregistrée ; visible immédiatement sur la fiche. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { OpportunityPage } from '../../../lib/opportunity-page';

export const prerender = false;

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), page: OpportunityPage }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Données invalides.');
  const [d] = await db.select({ owner: dossier.ownerId, ref: dossier.reference }).from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || d.owner !== u.id) return fail('Accès refusé.', 403);
  await db.update(dossier).set({ page: p.data.page, updatedAt: new Date() }).where(eq(dossier.id, p.data.dossierId));
  await audit(u.id, 'kapital.page.modification', d.ref, {}, clientIp(request));
  return json({ ok: true, message: 'Page d’opportunité enregistrée.' });
};
