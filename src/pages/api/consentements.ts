/* Consentements séparés et révocables (CDC §15.1). GET : état courant ; POST : { kind, granted }. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { consent, consentKindEnum } from '../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const rows = await db.select().from(consent).where(eq(consent.userId, u.id)).orderBy(desc(consent.at));
  const state: Record<string, boolean> = {};
  for (const r of rows) if (!(r.kind in state)) state[r.kind] = r.granted; // dernier choix
  return json({ ok: true, consents: state });
};

const Body = z.object({ kind: z.enum(consentKindEnum.enumValues), granted: z.boolean() });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  await db.insert(consent).values({ userId: u.id, kind: p.data.kind, granted: p.data.granted, ip: clientIp(request) });
  await audit(u.id, p.data.granted ? 'consentement.accorde' : 'consentement.retire', p.data.kind, {}, clientIp(request));
  return json({ ok: true });
};
