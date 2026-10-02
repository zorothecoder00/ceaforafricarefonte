/* Profil 360° (CDC §9.1) : mise à jour du profil et des préférences. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { profile } from '../../db/schema/app';
import { user } from '../../db/schema/auth';
import { json, fail, requireUser, audit, clientIp } from '../../lib/session';

export const prerender = false;

const s = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const Body = z.object({
  name: z.string().trim().min(2).max(120),
  headline: s(140), bio: s(2000), country: s(2), city: s(80), sector: s(80), companyName: s(140),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  needs: s(500), offers: s(500),
  visibility: z.enum(['public', 'membres', 'prive']).default('membres'),
  lang: z.enum(['fr', 'en']).default('fr'),
  currency: z.string().length(3).default('XOF'),
});

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez les champs du profil : ' + p.error.issues.map((i) => i.path.join('.')).join(', '));
  const { name, ...rest } = p.data;
  await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, u.id));
  await db.insert(profile).values({ userId: u.id, ...rest, updatedAt: new Date() }).onConflictDoUpdate({ target: profile.userId, set: { ...rest, updatedAt: new Date() } });
  await audit(u.id, 'profil.modification', u.id, {}, clientIp(request));
  return json({ ok: true, message: 'Profil enregistré.' });
};
