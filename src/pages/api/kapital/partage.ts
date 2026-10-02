/* Partage d'un dossier avec les investisseurs (privé par défaut, révocable à tout moment). Révoquer ferme immédiatement tous les accès. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, nda } from '../../../db/schema/kapital';
import { consent } from '../../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ dossierId: z.uuid(), share: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [d] = await db.select().from(dossier).where(eq(dossier.id, p.data.dossierId));
  if (!d || d.ownerId !== u.id) return fail('Accès refusé.', 403);
  await db.update(dossier).set({ shareConsent: p.data.share, updatedAt: new Date() }).where(eq(dossier.id, d.id));
  if (!p.data.share) await db.update(nda).set({ revokedAt: new Date() }).where(and(eq(nda.dossierId, d.id), isNull(nda.revokedAt)));
  await db.insert(consent).values({ userId: u.id, kind: 'partage_investisseurs', granted: p.data.share, ip: clientIp(request) });
  await audit(u.id, p.data.share ? 'kapital.partage.active' : 'kapital.partage.revoque', d.reference, {}, clientIp(request));
  return json({ ok: true, message: p.data.share ? 'Partage activé.' : 'Partage révoqué : tous les accès sont fermés immédiatement.' });
};
