/* Café virtuel (CDC §7.8, V3) : chaque semaine, les membres volontaires sont mis en relation deux par deux pour un échange
   de 30 minutes en visio. Les paires des 8 dernières semaines ne se reforment pas ; en nombre impair, un membre attend la
   semaine suivante (il sera prioritaire). Tirage le lundi (ou au premier passage du cron de la semaine). */
import { randomInt } from 'node:crypto';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { db } from './db';
import { coffeeMatch, coffeeOptin } from '../db/schema/app';
import { notify } from './notify';

const DAY = 86_400_000;
export const mondayOf = (d = new Date()) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
export const coffeeVisio = (id: string) => `https://meet.jit.si/CEA-cafe-${id.slice(0, 8)}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Calcul pur des paires : `order` = participants (prioritaires d'abord), `recent` = paires interdites. */
export function makePairs(order: string[], recent: Set<string>) {
  const left = [...order], pairs: [string, string][] = [];
  while (left.length > 1) {
    const a = left.shift()!;
    const j = left.findIndex((b) => !recent.has(pairKey(a, b)));
    if (j === -1) continue; // personne de nouveau pour lui cette semaine
    pairs.push([a, left.splice(j, 1)[0]]);
  }
  const paired = new Set(pairs.flat());
  return { pairs, waiting: order.filter((u) => !paired.has(u)) };
}

export async function matchWeek(now = new Date()) {
  const week = mondayOf(now);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(coffeeMatch).where(eq(coffeeMatch.week, week));
  if (n) return { week, pairs: 0, skipped: 'déjà tiré' };
  const people = (await db.select({ id: coffeeOptin.userId }).from(coffeeOptin).where(eq(coffeeOptin.paused, false))).map((x) => x.id);
  if (people.length < 2) return { week, pairs: 0 };
  const since = new Date(Date.parse(`${week}T00:00:00Z`) - 8 * 7 * DAY).toISOString().slice(0, 10);
  const past = await db.select({ a: coffeeMatch.userA, b: coffeeMatch.userB, week: coffeeMatch.week }).from(coffeeMatch).where(gte(coffeeMatch.week, since)).orderBy(desc(coffeeMatch.week));
  const recent = new Set(past.map((p) => pairKey(p.a, p.b)));
  // Prioritaires : ceux qui n'ont pas eu de binôme la semaine passée ; puis ordre aléatoire
  const lastWeek = past[0]?.week, hadLast = new Set(past.filter((p) => p.week === lastWeek).flatMap((p) => [p.a, p.b]));
  const shuffled = [...people];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = randomInt(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const order = [...shuffled.filter((u) => !hadLast.has(u)), ...shuffled.filter((u) => hadLast.has(u))];
  const { pairs, waiting } = makePairs(order, recent);
  for (const [a, b] of pairs) {
    const [m] = await db.insert(coffeeMatch).values({ week, userA: a, userB: b }).returning({ id: coffeeMatch.id });
    for (const u of [a, b]) await notify(u, 'Café virtuel de la semaine : votre binôme vous attend. Fixez ensemble 30 minutes d’échange.', `/communaute/cafe#m-${m.id}`, { email: true });
  }
  for (const u of waiting) await notify(u, 'Café virtuel : pas de binôme disponible cette semaine. Vous serez prioritaire la semaine prochaine.', '/communaute/cafe');
  return { week, pairs: pairs.length, waiting: waiting.length };
}

export async function matchesOf(userId: string) {
  return db.select().from(coffeeMatch).where(or(eq(coffeeMatch.userA, userId), eq(coffeeMatch.userB, userId))).orderBy(desc(coffeeMatch.week)).limit(12);
}

/** Retour « la rencontre a eu lieu » / « n'a pas eu lieu » d'un des deux membres. */
export async function feedback(matchId: string, userId: string, met: boolean) {
  const [m] = await db.select().from(coffeeMatch).where(and(eq(coffeeMatch.id, matchId), or(eq(coffeeMatch.userA, userId), eq(coffeeMatch.userB, userId))));
  if (!m) return false;
  await db.update(coffeeMatch).set(m.userA === userId ? { metA: met } : { metB: met }).where(eq(coffeeMatch.id, m.id));
  return true;
}
