/* Profil talent (CDC §7.4) — multipart : headline, skills (séparées par des virgules), visible ('on'), cv (PDF/DOCX facultatif),
   et pour les étudiants : school, degree, studyLevel, availableFrom, availableUntil (AAAA-MM-JJ). */
import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { profile, userRole } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { storeFile } from '../../lib/storage';
import { STUDY_LEVELS } from '../../data/etudes';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const f = await request.formData().catch(() => null);
  if (!f) return fail('Formulaire invalide.');
  const headline = String(f.get('headline') ?? '').trim().slice(0, 140) || null;
  const skills = String(f.get('skills') ?? '').split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 30);
  const recruiterVisible = f.get('visible') === 'on';
  // Étudiants et jeunes diplômés : établissement, diplôme préparé, niveau, période de disponibilité
  const txt = (k: string, max = 140) => String(f.get(k) ?? '').trim().slice(0, max) || null;
  const day = (k: string) => { const v = String(f.get(k) ?? ''); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const studyLevel = txt('studyLevel');
  if (studyLevel && !(STUDY_LEVELS as readonly string[]).includes(studyLevel)) return fail("Niveau d'études inconnu.");
  const availableFrom = day('availableFrom'), availableUntil = day('availableUntil');
  if (availableFrom && availableUntil && availableUntil < availableFrom) return fail('La fin de disponibilité précède son début.');
  const set: Partial<typeof profile.$inferInsert> = { headline, skills, recruiterVisible, school: txt('school'), degree: txt('degree'), studyLevel, availableFrom, availableUntil, updatedAt: new Date() };
  const cv = f.get('cv');
  if (cv instanceof File && cv.size) {
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(cv.type)) return fail('CV au format PDF ou DOCX.');
    try { set.cvKey = (await storeFile(cv, `cv/${u.id}`)).key; } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
  }
  await db.insert(profile).values({ userId: u.id, ...set }).onConflictDoUpdate({ target: profile.userId, set });
  await db.insert(userRole).values({ userId: u.id, role: 'talent' }).onConflictDoNothing();
  return json({ ok: true, message: 'Profil talent enregistré.' });
};
