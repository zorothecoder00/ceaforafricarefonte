/* Mentorat (CDC §7.6).
   POST { mentorId, slot, goal }            → réservation d'une séance de mentorat (gratuite pour les membres)
   PATCH { id, status?, mentorNotes?, rating? } → mise à jour par le mentor (statut, compte rendu confidentiel) ou note par l'entrepreneur */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { mentorProfile, mentoringSession } from '../../db/schema/app';
import { user } from '../../db/schema/auth';
import { json, fail, requireUser, audit } from '../../lib/session';
import { notify } from '../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ mentorId: z.string(), slot: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), goal: z.string().trim().min(5).max(500) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Choisissez un créneau et décrivez votre objectif (5 caractères minimum).');
  const [m] = await db.select({ kind: mentorProfile.kind, name: user.name }).from(mentorProfile).innerJoin(user, eq(user.id, mentorProfile.userId)).where(and(eq(mentorProfile.userId, p.data.mentorId), eq(mentorProfile.active, true)));
  if (!m) return fail('Mentor introuvable.', 404);
  if (m.kind === 'expert') return json({ ok: true, redirect: `/paiement?objet=expert&ref=${p.data.mentorId}&creneau=${p.data.slot}` });
  if (p.data.mentorId === u.id) return fail('Vous ne pouvez pas réserver votre propre créneau.');
  const startsAt = new Date(p.data.slot);
  if (startsAt < new Date()) return fail('Ce créneau est passé.');
  const clash = await db.select().from(mentoringSession).where(and(eq(mentoringSession.mentorId, p.data.mentorId), eq(mentoringSession.startsAt, startsAt)));
  if (clash.length) return fail('Ce créneau vient d’être réservé. Choisissez-en un autre.', 409);
  await db.insert(mentoringSession).values({ kind: 'mentorat', mentorId: p.data.mentorId, menteeId: u.id, startsAt, goal: p.data.goal, status: 'demandee' });
  await notify(p.data.mentorId, `Nouvelle demande de mentorat de ${u.name} (${startsAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})`, '/espace/mentor', { email: true, whatsapp: true });
  return json({ ok: true, message: `Demande envoyée à ${m.name}. Vous serez notifié de sa confirmation.`, redirect: '/espace/mentorat' });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid(), status: z.enum(['confirmee', 'realisee', 'annulee']).optional(), mentorNotes: z.string().max(5000).optional(), rating: z.number().int().min(1).max(5).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [sess] = await db.select().from(mentoringSession).where(eq(mentoringSession.id, p.data.id));
  if (!sess) return fail('Séance introuvable.', 404);
  const isMentor = sess.mentorId === u.id, isMentee = sess.menteeId === u.id;
  if (!isMentor && !isMentee) return fail('Accès refusé.', 403);
  const set: Partial<typeof mentoringSession.$inferInsert> = {};
  if (p.data.status && (isMentor || p.data.status === 'annulee')) set.status = p.data.status;
  if (p.data.mentorNotes !== undefined && isMentor) set.mentorNotes = p.data.mentorNotes; // notes confidentielles (CDC §7.6)
  if (p.data.rating && isMentee) set.menteeRating = p.data.rating;
  if (!Object.keys(set).length) return fail('Rien à modifier.');
  await db.update(mentoringSession).set(set).where(eq(mentoringSession.id, sess.id));
  if (set.status) await notify(isMentor ? sess.menteeId : sess.mentorId, `Séance de mentorat : ${set.status}`, isMentor ? '/espace/mentorat' : '/espace/mentor');
  await audit(u.id, 'mentorat.maj', sess.id, { ...set, mentorNotes: set.mentorNotes ? '(confidentiel)' : undefined });
  return json({ ok: true, message: 'Séance mise à jour.' });
};
