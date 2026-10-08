/* Séries de jours d'apprentissage (CDC §7.6, ludification) : chaque jour (UTC) où un membre valide une leçon ou un quiz compte.
   Série en cours = jours consécutifs jusqu'à aujourd'hui (ou hier : la série n'est perdue qu'à la fin de la journée).
   Paliers notifiés à 3, 7, 30 et 100 jours ; rappel la veille de la rupture (tâche quotidienne). */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { learningDay } from '../db/schema/app';
import { notify } from './notify';

export const MILESTONES = [3, 7, 30, 100] as const;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const prev = (d: string) => iso(new Date(Date.parse(`${d}T00:00:00Z`) - DAY));

/** Calcul pur à partir des jours d'activité (AAAA-MM-JJ, dans n'importe quel ordre). */
export function streakOf(days: string[], today = iso(new Date())) {
  const set = new Set(days);
  let current = 0;
  let d = set.has(today) ? today : prev(today);
  while (set.has(d)) { current++; d = prev(d); }
  const sorted = [...set].sort();
  let best = 0, run = 0, last = '';
  for (const x of sorted) { run = last && prev(x) === last ? run + 1 : 1; best = Math.max(best, run); last = x; }
  return { current, best, today: set.has(today), total: set.size };
}

export async function userStreak(userId: string, now = new Date()) {
  const rows = await db.select({ d: learningDay.day }).from(learningDay).where(eq(learningDay.userId, userId)).orderBy(desc(learningDay.day)).limit(400);
  return streakOf(rows.map((r) => r.d), iso(now));
}

/** Enregistre l'activité du jour ; notifie un palier atteint (une seule fois, le jour où il est franchi). */
export async function recordLearning(userId: string, now = new Date()) {
  const [r] = await db.insert(learningDay).values({ userId, day: iso(now) })
    .onConflictDoUpdate({ target: [learningDay.userId, learningDay.day], set: { actions: sql`${learningDay.actions} + 1` } }).returning({ actions: learningDay.actions });
  if (r.actions !== 1) return;
  const s = await userStreak(userId, now);
  if ((MILESTONES as readonly number[]).includes(s.current)) await notify(userId, `Série de ${s.current} jours d'apprentissage d'affilée : bravo, continuez !`, '/espace/apprentissage');
}

/** Rappel aux membres dont la série (3 jours ou plus) s'arrêtera ce soir faute d'activité aujourd'hui. */
export async function remindStreaks(now = new Date()) {
  const today = iso(now), yesterday = prev(today);
  const rows = await db.select({ userId: learningDay.userId }).from(learningDay)
    .where(and(eq(learningDay.day, yesterday), sql`not exists (select 1 from learning_day t where t.user_id = ${learningDay.userId} and t.day = ${today})`));
  let sent = 0;
  for (const { userId } of rows) {
    const s = await userStreak(userId, now);
    if (s.current < 3) continue;
    await notify(userId, `Votre série de ${s.current} jours d'apprentissage s'arrête ce soir : une leçon suffit pour la garder.`, '/espace/apprentissage');
    sent++;
  }
  return sent;
}
