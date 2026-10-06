/* Offres d'emploi gérées par l'équipe (CDC §7.4), droits « offre d'emploi » sur tout le site :
   POST { action: 'moderate', id, status: 'publiee' | 'refusee' | 'fermee', featured?, reason? } (V) → motif obligatoire en cas de refus
   POST { action: 'create', …champs de l'offre, recruiterEmail? }                               (C) → offre publiée directement
   POST { action: 'update', id, …champs de l'offre }                                             (M) → correction, le recruteur est prévenu
   POST { action: 'extend', id, days }                                                            (M) → prolongation (rouvre une offre expirée) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { job, userRole } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApiAll } from '../../../lib/admin';
import { notify } from '../../../lib/notify';
import { JobFields, JOB_DAYS, dispatchJobAlerts, inDays, internColumns, jobProblem } from '../../../lib/jobs';
import type { Action } from '../../../lib/rbac';
import { COUNTRIES } from '../../../data/site';

export const prerender = false;

const id = z.uuid();
const Fields = { ...JobFields, country: z.string().refine((c) => c in COUNTRIES, 'Pays inconnu.') };
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('moderate'), id, status: z.enum(['publiee', 'refusee', 'fermee']), featured: z.boolean().optional(), reason: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('create'), ...Fields, recruiterEmail: z.preprocess((v) => v || undefined, z.email('Adresse du recruteur invalide.').optional()) }),
  z.object({ action: z.literal('update'), id, ...Fields }),
  z.object({ action: z.literal('extend'), id, days: z.coerce.number().int().refine((d) => [30, 60, 90].includes(d), 'Durée : 30, 60 ou 90 jours.') }),
]);
const NEED: Record<string, Action> = { moderate: 'V', create: 'C', update: 'M', extend: 'M' };
const dateFr = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Lome' });

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.');
  const b = p.data;
  const u = staffApiAll(locals.user, 'offre_emploi', NEED[b.action]);
  if (u instanceof Response) return u;
  const ip = clientIp(request);

  if (b.action === 'create') {
    const problem = jobProblem(b);
    if (problem) return fail(problem);
    let employerId: string | null = null;
    if (b.recruiterEmail) {
      const [r] = await db.select({ id: user.id }).from(user).where(eq(user.email, b.recruiterEmail.toLowerCase()));
      if (!r) return fail('Aucun compte avec l’adresse du recruteur : laissez le champ vide, ou créez d’abord son compte (Membres et rôles).');
      employerId = r.id;
    }
    const now = new Date();
    const [row] = await db.insert(job).values({
      employerId, title: b.title, company: b.company, country: b.country, type: b.type, remote: b.remote, salary: b.salary || null, skills: b.skills, description: b.description || null,
      ...internColumns(b), status: 'publiee', publishedAt: now, expiresAt: inDays(JOB_DAYS, now),
    }).returning();
    if (employerId) {
      await db.insert(userRole).values({ userId: employerId, role: 'employeur' }).onConflictDoNothing();
      await notify(employerId, `L'équipe CEA a publié votre offre « ${b.title} ». Les candidatures arrivent dans votre espace recruteur.`, '/espace/recruteur', { email: true }).catch(() => {});
    }
    await dispatchJobAlerts(row);
    await audit(u.id, 'admin.emploi.creation', row.id, { titre: b.title, recruteur: employerId }, ip);
    return json({ ok: true, id: row.id, message: `Offre publiée jusqu’au ${dateFr(row.expiresAt!)}.` });
  }

  const [j] = await db.select().from(job).where(eq(job.id, b.id));
  if (!j) return fail('Offre introuvable.', 404);

  switch (b.action) {
    case 'moderate': {
      if (b.status === 'refusee' && (b.reason ?? '').length < 5) return fail('Indiquez au recruteur le motif du refus (5 caractères minimum).');
      const first = b.status === 'publiee' && !j.publishedAt;
      const now = new Date();
      await db.update(job).set({
        status: b.status,
        ...(b.featured !== undefined && { featured: b.featured }),
        ...(first && { publishedAt: now, expiresAt: inDays(JOB_DAYS, now) }),
        moderationNote: b.status === 'refusee' ? b.reason! : b.status === 'publiee' ? null : j.moderationNote,
      }).where(eq(job.id, b.id));
      if (j.employerId && (b.status !== j.status)) {
        const msg = b.status === 'publiee' ? `Votre offre « ${j.title} » est publiée.`
          : b.status === 'refusee' ? `Votre offre « ${j.title} » n'a pas été validée. Motif : ${b.reason}`
          : `Votre offre « ${j.title} » est fermée.`;
        await notify(j.employerId, msg, '/espace/recruteur', { email: true }).catch(() => {});
      }
      if (first) await dispatchJobAlerts(j); // alertes emploi à la première publication
      await audit(u.id, 'admin.emploi.' + b.status, b.id, { ...(b.reason && { motif: b.reason }), ...(b.featured !== undefined && { miseEnAvant: b.featured }) }, ip);
      return json({ ok: true, message: b.status === 'refusee' ? 'Offre refusée : le recruteur reçoit le motif.' : 'Offre mise à jour.' });
    }
    case 'update': {
      const problem = jobProblem(b);
      if (problem) return fail(problem);
      const after = { title: b.title, company: b.company, country: b.country, type: b.type, remote: b.remote, salary: b.salary || null, skills: b.skills, description: b.description || null, ...internColumns(b) };
      const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(j[k]));
      if (!changed.length) return json({ ok: true, message: 'Aucune modification.' });
      await db.update(job).set(after).where(eq(job.id, b.id));
      await audit(u.id, 'admin.emploi.modification', b.id, { champs: changed, avant: Object.fromEntries(changed.map((k) => [k, j[k]])) }, ip);
      if (j.employerId) await notify(j.employerId, `L'équipe CEA a corrigé votre offre « ${b.title} » (${changed.length} champ${changed.length > 1 ? 's' : ''}).`, '/espace/recruteur').catch(() => {});
      return json({ ok: true, message: 'Offre corrigée.' });
    }
    case 'extend': {
      if (j.status !== 'publiee' && j.status !== 'fermee') return fail('Seule une offre publiée ou fermée peut être prolongée.');
      const now = new Date();
      const base = j.expiresAt && j.expiresAt > now ? j.expiresAt : now;
      const expiresAt = inDays(b.days, base);
      await db.update(job).set({ status: 'publiee', expiresAt, publishedAt: j.publishedAt ?? now }).where(eq(job.id, b.id));
      await audit(u.id, 'admin.emploi.prolongation', b.id, { jours: b.days, avant: j.expiresAt, apres: expiresAt, rouverte: j.status === 'fermee' }, ip);
      if (j.employerId) await notify(j.employerId, `Votre offre « ${j.title} » est visible jusqu'au ${dateFr(expiresAt)}.`, '/espace/recruteur').catch(() => {});
      return json({ ok: true, message: `Offre visible jusqu’au ${dateFr(expiresAt)}.` });
    }
  }
};
