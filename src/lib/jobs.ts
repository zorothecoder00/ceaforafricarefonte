/* Lecture des offres d'emploi publiées et correspondance avec le profil du talent (CDC §7.4). */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from './db';
import { job, savedItem, profile } from '../db/schema/app';

export type JobRow = { id: string; t: string; co: string; c: string; type: string; remote: boolean; diaspora: boolean; sal: string; skills: string[]; featured: boolean; saved: boolean; start: string | null; dur: number | null; level: string | null; tutor: string | null };

export async function listJobs(opts: { userId?: string; types?: string[]; diaspora?: boolean; company?: string } = {}): Promise<JobRow[]> {
  const rows = await db.select({
    j: job,
    saved: opts.userId ? sql<boolean>`exists(select 1 from ${savedItem} where ${savedItem.userId} = ${opts.userId} and ${savedItem.kind} = 'job' and ${savedItem.itemId} = ${job.id}::text)` : sql<boolean>`false`,
  }).from(job).where(and(
    eq(job.status, 'publiee'),
    opts.types?.length ? sql`${job.type} in (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})` : undefined,
    opts.diaspora ? or(eq(job.diaspora, true), eq(job.remote, true)) : undefined,
    opts.company ? ilike(job.company, `${opts.company}%`) : undefined,
  )).orderBy(desc(job.featured), desc(job.publishedAt)).limit(200);
  return rows.map(({ j, saved }) => ({ id: j.id, t: j.title, co: j.company, c: j.country, type: j.type, remote: j.remote, diaspora: j.diaspora, sal: j.salary ?? 'Selon profil', skills: j.skills, featured: j.featured, saved, start: j.startDate, dur: j.durationMonths, level: j.studyLevel, tutor: j.tutor }));
}

export async function mySkills(userId?: string) {
  if (!userId) return [];
  const [p] = await db.select({ skills: profile.skills }).from(profile).where(eq(profile.userId, userId));
  return p?.skills ?? [];
}
