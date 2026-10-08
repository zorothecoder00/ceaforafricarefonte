/* Points de contribution, classements par pays et ambassadeurs (CDC §7.8, V2).
   Le registre se remplit chaque jour à partir des activités réelles (requêtes idempotentes : un motif + une référence ne
   rapportent qu'une fois) ; le parrainage crédite ses points au moment où le filleul devient actif (src/lib/referrals.ts). */
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { contributionPoint, countryAmbassador, profile } from '../db/schema/app';
import { user } from '../db/schema/auth';

export const BAREME = {
  publication: { pts: 5, label: 'Publication dans la communauté' },
  evaluation: { pts: 5, label: 'Évaluation d’un pair (cohorte)' },
  evenement: { pts: 10, label: 'Présence à un événement' },
  badge: { pts: 15, label: 'Badge de compétence obtenu' },
  cours: { pts: 20, label: 'Cours terminé' },
  filleul: { pts: 20, label: 'Bienvenue d’un filleul actif' },
  mentorat: { pts: 25, label: 'Séance de mentorat donnée' },
  parrainage: { pts: 50, label: 'Filleul devenu actif' },
} as const;
export type Reason = keyof typeof BAREME;

/** Synchronise le registre avec les activités : renvoie le nombre de lignes ajoutées. */
export async function syncPoints() {
  const P = (r: Reason) => BAREME[r].pts;
  const r = await db.execute(sql`
    with ins as (
      insert into contribution_point (user_id, points, reason, ref, at)
      select author_id, ${P('publication')}::int, 'publication', id::text, created_at from post where status = 'publie'
      union all select user_id, ${P('cours')}::int, 'cours', course_id, completed_at from enrollment where completed_at is not null
      union all select user_id, ${P('badge')}::int, 'badge', number, issued_at from certificate where subject like 'test:%' and revoked_at is null
      union all (select distinct on (user_id, event_id) user_id, ${P('evenement')}::int, 'evenement', event_id, checked_in_at from event_ticket where checked_in_at is not null and user_id is not null)
      union all select mentor_id, ${P('mentorat')}::int, 'mentorat', id::text, starts_at from mentoring_session where status = 'realisee'
      union all select reviewer_id, ${P('evaluation')}::int, 'evaluation', id::text, done_at from academy_review where done_at is not null
      on conflict (user_id, reason, ref) do nothing
      returning 1
    ) select count(*)::int as n from ins`);
  return Number((r.rows[0] as { n: number }).n);
}

export async function award(userId: string, reason: Reason, ref: string) {
  await db.insert(contributionPoint).values({ userId, points: BAREME[reason].pts, reason, ref }).onConflictDoNothing();
}

/** « Aïcha A. » : prénom et initiale du nom dans les classements publics. */
export const shortName = (name: string) => { const [f, ...rest] = name.trim().split(/\s+/); const l = rest.at(-1); return l ? `${f} ${l[0].toUpperCase()}.` : f; };

export type Rank = { userId: string; name: string; country: string | null; points: number; rank: number };
/** Classement (pays facultatif, depuis une date facultative). */
export async function ranking(o: { country?: string | null; since?: Date | null; limit?: number } = {}): Promise<Rank[]> {
  const rows = await db.select({ userId: contributionPoint.userId, name: user.name, country: profile.country, points: sql<number>`sum(${contributionPoint.points})::int` })
    .from(contributionPoint).innerJoin(user, eq(user.id, contributionPoint.userId)).leftJoin(profile, eq(profile.userId, contributionPoint.userId))
    .where(and(...(o.country ? [eq(profile.country, o.country)] : []), ...(o.since ? [gte(contributionPoint.at, o.since)] : [])))
    .groupBy(contributionPoint.userId, user.name, profile.country).orderBy(desc(sql`4`), user.name).limit(o.limit ?? 1000);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function pointsOf(userId: string) {
  const rows = await db.select({ reason: contributionPoint.reason, points: sql<number>`sum(${contributionPoint.points})::int`, n: sql<number>`count(*)::int` })
    .from(contributionPoint).where(eq(contributionPoint.userId, userId)).groupBy(contributionPoint.reason);
  return { total: rows.reduce((a, r) => a + r.points, 0), byReason: rows };
}

export async function ambassadors() {
  return db.select({ userId: countryAmbassador.userId, country: countryAmbassador.country, since: countryAmbassador.since, name: user.name })
    .from(countryAmbassador).innerJoin(user, eq(user.id, countryAmbassador.userId)).where(isNull(countryAmbassador.endedAt));
}
