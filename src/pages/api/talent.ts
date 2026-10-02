/* Profil talent (CDC §7.4) — multipart : headline, skills (séparées par des virgules), visible ('on'), cv (PDF/DOCX facultatif). */
import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { profile, userRole } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { storeFile } from '../../lib/storage';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const f = await request.formData().catch(() => null);
  if (!f) return fail('Formulaire invalide.');
  const headline = String(f.get('headline') ?? '').trim().slice(0, 140) || null;
  const skills = String(f.get('skills') ?? '').split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 30);
  const recruiterVisible = f.get('visible') === 'on';
  const set: Partial<typeof profile.$inferInsert> = { headline, skills, recruiterVisible, updatedAt: new Date() };
  const cv = f.get('cv');
  if (cv instanceof File && cv.size) {
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(cv.type)) return fail('CV au format PDF ou DOCX.');
    try { set.cvKey = (await storeFile(cv, `cv/${u.id}`)).key; } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
  }
  await db.insert(profile).values({ userId: u.id, ...set }).onConflictDoUpdate({ target: profile.userId, set });
  await db.insert(userRole).values({ userId: u.id, role: 'talent' }).onConflictDoNothing();
  return json({ ok: true, message: 'Profil talent enregistré.' });
};
