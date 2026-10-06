/* CEA Talents (CDC §7.4).
   POST { action:'candidater', jobId }                 → candidature en un clic avec le profil
   POST { action:'sauvegarder', jobId, save }          → offres sauvegardées
   POST { action:'alerte', q?, country?, type?, remote? } → alerte (WhatsApp)
   POST { action:'publier', title, company, country, type, remote, salary, skills, description, featured } → offre en modération
   POST { action:'embauche', personName, contract, hiredOn, country }   → déclaration d'embauche (mesure des emplois)
   PATCH { applicationId, status, note? }               → tri des candidatures par l'employeur et son équipe de recrutement */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { job, jobApplication, savedItem, jobAlert, hireDeclaration, userRole, jobTypeEnum } from '../../db/schema/app';
import { json, fail, requireUser, audit } from '../../lib/session';
import { notify } from '../../lib/notify';
import { JobFields, jobLive, jobProblem, internColumns } from '../../lib/jobs';
import { canRecruit } from '../../lib/recruiting';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('candidater'), jobId: z.uuid() }),
  z.object({ action: z.literal('sauvegarder'), jobId: z.uuid(), save: z.boolean().default(true) }),
  z.object({ action: z.literal('alerte'), q: z.string().max(80).optional(), country: z.string().max(2).optional(), type: z.string().max(20).optional(), remote: z.boolean().optional() }),
  z.object({ action: z.literal('publier'), ...JobFields, featured: z.boolean().default(false) }),
  z.object({ action: z.literal('embauche'), personName: z.string().trim().min(2).max(120), contract: z.enum(jobTypeEnum.enumValues), hiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), country: z.string().max(2).optional() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez les champs du formulaire.');
  const b = p.data;
  switch (b.action) {
    case 'candidater': {
      const [j] = await db.select().from(job).where(and(eq(job.id, b.jobId), jobLive()));
      if (!j) return fail('Cette offre n’est plus disponible.', 404);
      const ins = await db.insert(jobApplication).values({ jobId: j.id, userId: u.id }).onConflictDoNothing().returning();
      if (!ins.length) return json({ ok: true, message: 'Vous avez déjà postulé à cette offre.' });
      await db.insert(userRole).values({ userId: u.id, role: 'talent' }).onConflictDoNothing();
      if (j.employerId) await notify(j.employerId, `Nouvelle candidature de ${u.name} : ${j.title}`, '/espace/recruteur', { email: true });
      return json({ ok: true, message: 'Candidature envoyée avec votre profil CEA. Suivez-la dans « Mes candidatures ».' });
    }
    case 'sauvegarder':
      if (b.save) await db.insert(savedItem).values({ userId: u.id, kind: 'job', itemId: b.jobId }).onConflictDoNothing();
      else await db.delete(savedItem).where(and(eq(savedItem.userId, u.id), eq(savedItem.kind, 'job'), eq(savedItem.itemId, b.jobId)));
      return json({ ok: true, message: b.save ? 'Offre sauvegardée.' : 'Offre retirée de vos favoris.' });
    case 'alerte':
      await db.insert(jobAlert).values({ userId: u.id, query: { q: b.q, country: b.country, type: b.type, remote: b.remote } });
      return json({ ok: true, message: 'Alerte créée : vous recevrez les nouvelles offres correspondantes par WhatsApp.' });
    case 'publier': {
      const problem = jobProblem(b);
      if (problem) return fail(problem);
      const [row] = await db.insert(job).values({
        employerId: u.id, title: b.title, company: b.company, country: b.country, type: b.type, remote: b.remote, salary: b.salary, skills: b.skills, description: b.description, status: 'en_moderation',
        ...internColumns(b),
      }).returning({ id: job.id });
      await db.insert(userRole).values({ userId: u.id, role: 'employeur' }).onConflictDoNothing();
      await audit(u.id, 'emploi.publication', row.id);
      if (b.featured) return json({ ok: true, message: 'Offre soumise à la modération.', redirect: `/paiement?objet=mise_en_avant&ref=${row.id}` });
      return json({ ok: true, message: 'Offre soumise à la modération : publication sous 24 heures.' });
    }
    case 'embauche':
      await db.insert(hireDeclaration).values({ employerId: u.id, personName: b.personName, contract: b.contract, hiredOn: b.hiredOn, country: b.country });
      await audit(u.id, 'emploi.embauche', b.personName, { contract: b.contract });
      return json({ ok: true, message: 'Embauche déclarée. Merci : elle compte dans l’observatoire d’impact après vérification à 6 mois.' });
  }
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ applicationId: z.uuid(), status: z.enum(['envoyee', 'vue', 'entretien', 'offre', 'refus']), note: z.string().max(2000).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [a] = await db.select({ a: jobApplication, employer: job.employerId, title: job.title }).from(jobApplication).innerJoin(job, eq(job.id, jobApplication.jobId)).where(eq(jobApplication.id, p.data.applicationId));
  if (!a || !(await canRecruit(u.id, a.a.jobId))) return fail('Accès refusé.', 403);
  await db.update(jobApplication).set({ status: p.data.status, note: p.data.note ?? a.a.note, updatedAt: new Date() }).where(eq(jobApplication.id, a.a.id));
  const MSG: Record<string, string> = { vue: 'a été consultée', entretien: ': vous êtes invité·e en entretien', offre: ': une offre vous est faite', refus: "n'a pas été retenue" };
  if (MSG[p.data.status]) await notify(a.a.userId, `Votre candidature « ${a.title} » ${MSG[p.data.status]}.`, '/espace/candidatures', { email: true, whatsapp: p.data.status === 'entretien' || p.data.status === 'offre' });
  return json({ ok: true, message: 'Candidature mise à jour.' });
};
