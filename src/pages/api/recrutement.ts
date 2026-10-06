/* Outils du recruteur (CDC §7.4) — réservés à l'auteur de l'offre et à son équipe de recrutement.
   POST { action:'equipe', jobId, email }              → ajoute un collègue (auteur de l'offre seulement)
   POST { action:'equipe.retirer', jobId, userId }     → retire un collègue (auteur seulement)
   POST { action:'note', applicationId, body }         → note d'équipe sur un candidat (jamais visible du candidat)
   POST { action:'entretien', applicationId, startsAt, minutes, mode, place? } → planifie un entretien (heure de Lomé, GMT), prévient le candidat
   POST { action:'entretien.annuler', id }             → annule un entretien, prévient le candidat
   POST { action:'modele', name, body }                → enregistre une réponse type personnelle
   POST { action:'modele.supprimer', id }              → supprime une réponse type */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../lib/db';
import { job, jobApplication, jobRecruiter, jobApplicationNote, jobInterview, recruiterTemplate, profile } from '../../db/schema/app';
import { user } from '../../db/schema/auth';
import { json, fail, requireUser, audit } from '../../lib/session';
import { notify } from '../../lib/notify';
import { canRecruit, interviewPlace, INTERVIEW_MODES } from '../../lib/recruiting';
import { timezoneOf } from '../../lib/localisation';

export const prerender = false;

const id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('equipe'), jobId: id, email: z.email().trim().toLowerCase() }),
  z.object({ action: z.literal('equipe.retirer'), jobId: id, userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('note'), applicationId: id, body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('entretien'), applicationId: id, startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), minutes: z.coerce.number().int().min(10).max(240).default(45), mode: z.enum(['visio', 'presentiel', 'telephone']), place: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('entretien.annuler'), id }),
  z.object({ action: z.literal('modele'), name: z.string().trim().min(2).max(80), body: z.string().trim().min(5).max(4000) }),
  z.object({ action: z.literal('modele.supprimer'), id }),
]);

const appJob = async (applicationId: string) => (await db.select({ a: jobApplication, title: job.title }).from(jobApplication).innerJoin(job, eq(job.id, jobApplication.jobId)).where(eq(jobApplication.id, applicationId)))[0];

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez les champs du formulaire.');
  const b = p.data;
  switch (b.action) {
    case 'equipe':
    case 'equipe.retirer': {
      const [j] = await db.select({ owner: job.employerId, title: job.title }).from(job).where(eq(job.id, b.jobId));
      if (!j || j.owner !== u.id) return fail('Seul l’auteur de l’offre gère son équipe de recrutement.', 403);
      if (b.action === 'equipe.retirer') {
        await db.delete(jobRecruiter).where(and(eq(jobRecruiter.jobId, b.jobId), eq(jobRecruiter.userId, b.userId)));
        await audit(u.id, 'recrutement.equipe.retrait', b.jobId, { userId: b.userId });
        return json({ ok: true, message: 'Collègue retiré de l’équipe.' });
      }
      const [c] = await db.select({ id: user.id, name: user.name }).from(user).where(sql`lower(${user.email}) = ${b.email}`);
      if (!c) return fail('Aucun compte CEA avec cette adresse : votre collègue doit d’abord créer son compte.');
      if (c.id === u.id) return fail('Vous gérez déjà cette offre.');
      await db.insert(jobRecruiter).values({ jobId: b.jobId, userId: c.id }).onConflictDoNothing();
      await notify(c.id, `${u.name} vous a ajouté à l’équipe de recrutement de l’offre « ${j.title} ».`, '/espace/recruteur', { email: true });
      await audit(u.id, 'recrutement.equipe.ajout', b.jobId, { userId: c.id });
      return json({ ok: true, message: `${c.name} fait maintenant partie de l’équipe de recrutement.` });
    }
    case 'note': {
      const x = await appJob(b.applicationId);
      if (!x || !(await canRecruit(u.id, x.a.jobId))) return fail('Accès refusé.', 403);
      await db.insert(jobApplicationNote).values({ applicationId: x.a.id, authorId: u.id, body: b.body });
      return json({ ok: true, message: 'Note ajoutée (visible de l’équipe uniquement).' });
    }
    case 'entretien': {
      const x = await appJob(b.applicationId);
      if (!x || !(await canRecruit(u.id, x.a.jobId))) return fail('Accès refusé.', 403);
      const startsAt = new Date(b.startsAt + ':00Z'); // heure de Lomé (GMT)
      if (startsAt.getTime() < Date.now()) return fail('Choisissez une date à venir.');
      const [row] = await db.insert(jobInterview).values({ applicationId: x.a.id, startsAt, minutes: b.minutes, mode: b.mode, place: b.place || null, createdBy: u.id }).returning();
      if (x.a.status !== 'entretien') await db.update(jobApplication).set({ status: 'entretien', updatedAt: new Date() }).where(eq(jobApplication.id, x.a.id));
      // Heure donnée au candidat dans le fuseau de son pays (Paramétrage › Pays, langues, devises), heure de Lomé à défaut
      const [cand] = await db.select({ c: profile.country }).from(profile).where(eq(profile.userId, x.a.userId));
      const tz = await timezoneOf(cand?.c);
      const when = startsAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: tz });
      const where = interviewPlace(row.id, b.mode, row.place);
      await notify(x.a.userId, `Entretien pour « ${x.title} » : ${when} (heure locale, ${tz.replace('Africa/', '').replace('_', ' ')}) · ${INTERVIEW_MODES[b.mode]}${where ? ` · ${where}` : ''}.`, '/espace/candidatures', { email: true, whatsapp: true });
      await audit(u.id, 'recrutement.entretien', x.a.id, { startsAt: startsAt.toISOString(), mode: b.mode });
      return json({ ok: true, message: 'Entretien planifié : le candidat est prévenu.' });
    }
    case 'entretien.annuler': {
      const [iv] = await db.select({ iv: jobInterview, a: jobApplication, title: job.title }).from(jobInterview).innerJoin(jobApplication, eq(jobApplication.id, jobInterview.applicationId)).innerJoin(job, eq(job.id, jobApplication.jobId)).where(and(eq(jobInterview.id, b.id), isNull(jobInterview.cancelledAt)));
      if (!iv || !(await canRecruit(u.id, iv.a.jobId))) return fail('Accès refusé.', 403);
      await db.update(jobInterview).set({ cancelledAt: new Date() }).where(eq(jobInterview.id, b.id));
      const when = iv.iv.startsAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lome' });
      await notify(iv.a.userId, `L’entretien du ${when} pour « ${iv.title} » est annulé. Le recruteur vous recontactera.`, '/espace/candidatures', { email: true });
      return json({ ok: true, message: 'Entretien annulé : le candidat est prévenu.' });
    }
    case 'modele':
      await db.insert(recruiterTemplate).values({ userId: u.id, name: b.name, body: b.body });
      return json({ ok: true, message: 'Réponse type enregistrée.' });
    case 'modele.supprimer':
      await db.delete(recruiterTemplate).where(and(eq(recruiterTemplate.id, b.id), eq(recruiterTemplate.userId, u.id)));
      return json({ ok: true, message: 'Réponse type supprimée.' });
  }
};
