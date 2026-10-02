/* Profil de mentor / expert : candidature et disponibilités. Le rôle « mentor » est attribué après validation par l'équipe. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { mentorProfile, programmeApplication } from '../../../db/schema/app';
import { json, fail, requireUser, reference, audit } from '../../../lib/session';
import { hasRole } from '../../../lib/rbac';

export const prerender = false;

const Body = z.object({
  expertise: z.string().trim().min(5).max(200),
  sectors: z.array(z.string().max(40)).max(10).default([]),
  languages: z.array(z.string().max(30)).max(6).default([]),
  timezone: z.string().max(40).default('Africa/Lome'),
  kind: z.enum(['mentorat', 'expert']).default('mentorat'),
  priceXof: z.number().int().min(0).max(5_000_000).default(0),
  slots: z.array(z.object({ day: z.number().int().min(0).max(6), time: z.string().regex(/^\d{2}:\d{2}$/) })).max(30).default([]),
});

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez votre expertise et vos créneaux.');
  const active = hasRole(u.roles, 'mentor');
  await db.insert(mentorProfile).values({ userId: u.id, ...p.data, active }).onConflictDoUpdate({ target: mentorProfile.userId, set: { ...p.data } });
  if (!active) {
    const pending = await db.select({ id: programmeApplication.id }).from(programmeApplication).where(and(eq(programmeApplication.userId, u.id), eq(programmeApplication.programme, 'mentor')));
    if (!pending.length) await db.insert(programmeApplication).values({ reference: reference('MENT'), userId: u.id, programme: 'mentor', data: { expertise: p.data.expertise } });
    await audit(u.id, 'mentor.candidature', u.id);
    return json({ ok: true, message: 'Candidature de mentor envoyée : l’équipe programmes la valide sous 5 jours ouvrés.' });
  }
  return json({ ok: true, message: 'Profil et disponibilités enregistrés.' });
};
