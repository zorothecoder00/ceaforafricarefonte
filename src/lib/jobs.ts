/* Lecture des offres d'emploi publiées et correspondance avec le profil du talent (CDC §7.4). */
import { and, desc, eq, gt, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { job, savedItem, profile, jobAlert, jobTypeEnum } from '../db/schema/app';
import { notify } from './notify';
import { STUDY_LEVELS, INTERN_TYPES } from '../data/etudes';

/** Durée de publication d'une offre (jours), prolongeable par l'équipe. */
export const JOB_DAYS = 60;
export const inDays = (n: number, from = new Date()) => new Date(from.getTime() + n * 86_400_000);

/** Offre visible du public : publiée et non expirée. */
export const jobLive = (now = new Date()) => and(eq(job.status, 'publiee'), or(isNull(job.expiresAt), gt(job.expiresAt, now)));

// Lutte contre la discrimination (CDC §7.4) : pas de critère d'âge, de religion, d'origine ou de sexe dans les offres
export const DISCRIM = /\b(âge|age maximum|moins de \d+ ans|religion|musulman|chrétien|ethnie|origine ethnique|nationalité exigée|sexe masculin|sexe féminin|homme uniquement|femme uniquement)\b/i;

/** Champs d'une offre (dépôt par un recruteur, saisie ou correction par l'équipe). */
export const JobFields = {
  title: z.string().trim().min(3).max(140), company: z.string().trim().min(2).max(140), country: z.string().length(2),
  type: z.enum(jobTypeEnum.enumValues), remote: z.boolean().default(false), salary: z.string().max(80).optional(), skills: z.array(z.string().max(40)).max(15).default([]),
  description: z.string().max(6000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')), durationMonths: z.number().int().min(1).max(36).nullable().optional(),
  studyLevel: z.enum(STUDY_LEVELS).optional().or(z.literal('')), tutor: z.string().trim().max(140).optional(),
};
type JobInput = { title: string; description?: string; type: (typeof jobTypeEnum.enumValues)[number]; startDate?: string; durationMonths?: number | null; tutor?: string; studyLevel?: string };

/** Contrôles de contenu d'une offre : message d'erreur, ou null si elle est recevable. */
export function jobProblem(b: JobInput): string | null {
  if (DISCRIM.test(`${b.title} ${b.description ?? ''}`)) return 'Les critères d’âge, de religion, d’origine ou de sexe sont interdits dans les offres.';
  // Un stage ou une alternance décrit de vraies missions d'apprentissage, une durée et un tuteur (CDC §7.4)
  if (INTERN_TYPES.includes(b.type) && (!b.startDate || !b.durationMonths || !b.tutor || (b.description ?? '').trim().length < 80)) return 'Pour un stage ou une alternance, indiquez la date de début, la durée, le tuteur et les missions (80 caractères minimum).';
  if (b.type === 'Stage' && b.durationMonths && b.durationMonths > 12) return 'Un stage ne peut pas dépasser 12 mois : proposez plutôt une alternance ou un CDD.';
  return null;
}
/** Colonnes propres aux stages et à l'alternance (vidées pour les autres contrats). */
export const internColumns = (b: JobInput) => INTERN_TYPES.includes(b.type)
  ? { startDate: b.startDate || null, durationMonths: b.durationMonths ?? null, studyLevel: b.studyLevel || null, tutor: b.tutor || null }
  : { startDate: null, durationMonths: null, studyLevel: null, tutor: null };

/** Alertes emploi correspondant à une offre qui vient d'être publiée (WhatsApp). */
export async function dispatchJobAlerts(j: { title: string; company: string; skills: string[]; country: string; type: string; remote: boolean }) {
  const alerts = await db.select().from(jobAlert);
  const hay = `${j.title} ${j.company} ${j.skills.join(' ')}`.toLowerCase();
  for (const a of alerts) {
    const q = a.query as { q?: string; country?: string; type?: string; remote?: boolean };
    if ((q.country && q.country !== j.country) || (q.type && q.type !== j.type) || (q.remote && !j.remote) || (q.q && !hay.includes(q.q.toLowerCase()))) continue;
    await notify(a.userId, `Nouvelle offre pour votre alerte : ${j.title} — ${j.company}`, `/opportunites?q=${encodeURIComponent(j.title)}`, { whatsapp: true }).catch(() => {});
  }
}

/** Ferme les offres arrivées à expiration (tâche quotidienne) et prévient les recruteurs. */
export async function closeExpiredJobs(now = new Date()): Promise<number> {
  const closed = await db.update(job).set({ status: 'fermee' }).where(and(eq(job.status, 'publiee'), lte(job.expiresAt, now))).returning({ id: job.id, title: job.title, employerId: job.employerId });
  for (const j of closed) if (j.employerId) await notify(j.employerId, `Votre offre « ${j.title} » est arrivée à expiration et n'est plus visible. Pour la prolonger, contactez l'équipe CEA ou publiez-la à nouveau.`, '/espace/recruteur', { email: true }).catch(() => {});
  return closed.length;
}

export type JobRow = { id: string; t: string; co: string; c: string; type: string; remote: boolean; diaspora: boolean; sal: string; skills: string[]; featured: boolean; saved: boolean; start: string | null; dur: number | null; level: string | null; tutor: string | null };

export async function listJobs(opts: { userId?: string; types?: string[]; diaspora?: boolean; company?: string } = {}): Promise<JobRow[]> {
  const rows = await db.select({
    j: job,
    saved: opts.userId ? sql<boolean>`exists(select 1 from ${savedItem} where ${savedItem.userId} = ${opts.userId} and ${savedItem.kind} = 'job' and ${savedItem.itemId} = ${job.id}::text)` : sql<boolean>`false`,
  }).from(job).where(and(
    jobLive(),
    opts.types?.length ? sql`${job.type} in (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})` : undefined,
    opts.diaspora ? or(eq(job.diaspora, true), eq(job.remote, true)) : undefined,
    opts.company ? ilike(job.company, `${opts.company}%`) : undefined,
  )).orderBy(desc(job.featured), desc(job.publishedAt)).limit(200);
  return rows.map(({ j, saved }) => ({ id: j.id, t: j.title, co: j.company, c: j.country, type: j.type, remote: j.remote, diaspora: j.diaspora, sal: j.salary ?? 'Selon profil', skills: j.skills, featured: j.featured, saved, start: j.startDate, dur: j.durationMonths, level: j.studyLevel, tutor: j.tutor }));
}

/** Compétences et pays du profil, pour le score de correspondance des offres (CDC §11). */
export async function myTalent(userId?: string): Promise<{ skills: string[]; country: string | null }> {
  if (!userId) return { skills: [], country: null };
  const [p] = await db.select({ skills: profile.skills, country: profile.country }).from(profile).where(eq(profile.userId, userId));
  return { skills: p?.skills ?? [], country: p?.country ?? null };
}

export async function mySkills(userId?: string) {
  if (!userId) return [];
  const [p] = await db.select({ skills: profile.skills }).from(profile).where(eq(profile.userId, userId));
  return p?.skills ?? [];
}
