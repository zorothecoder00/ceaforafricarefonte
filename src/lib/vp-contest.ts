/* Concours mensuel de portefeuille virtuel (CDC §8.6) : chaque membre reçoit 10 M FCFA fictifs par mois calendaire (UTC),
   achète et vend les sociétés fictives au cours simulé du jour (src/lib/marche-simule.ts) ; classement par valeur du portefeuille.
   Au début du mois suivant, le classement est figé et chaque participant reçoit son rang. Aucun gain financier. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { vpAccount, vpTrade } from '../db/schema/kapital';
import { priceMap } from './marche-simule';
import { notify } from './notify';

export const START_CASH = 10_000_000;
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
/** Dernier instant du mois `AAAA-MM` (valorisation finale). */
export const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1) - 1); };
export const previousMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return monthKey(new Date(Date.UTC(y, mo - 2, 1))); };
export const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** « de mars 2026 », « d’octobre 2026 » */
export const ofMonth = (m: string) => { const l = monthLabel(m); return /^[aeiouy]/i.test(l) ? `d’${l}` : `de ${l}`; };

type Account = typeof vpAccount.$inferSelect;
export const portfolioValue = (a: Pick<Account, 'cash' | 'positions'>, prices: Record<string, number>) =>
  a.cash + Object.entries(a.positions).reduce((s, [n, q]) => s + q * (prices[n] ?? 0), 0);
export const perfPct = (value: number) => Math.round((value / START_CASH - 1) * 10000) / 100;

export type RankRow = { userId: string; pseudo: string; value: number; perf: number; rank: number };
/** Classement d'un mois : en cours, aux cours du jour ; terminé, aux cours de fin de mois (ou au rang figé). */
export async function ranking(month: string, now = new Date()): Promise<RankRow[]> {
  const rows = await db.select().from(vpAccount).where(eq(vpAccount.month, month));
  const prices = priceMap(month === monthKey(now) ? now : monthEnd(month));
  return rows
    .map((a) => ({ userId: a.userId, pseudo: a.pseudo, value: a.finalValue ?? portfolioValue(a, prices), at: a.createdAt }))
    .sort((a, b) => b.value - a.value || a.at.getTime() - b.at.getTime())
    .map((a, i) => ({ userId: a.userId, pseudo: a.pseudo, value: a.value, perf: perfPct(a.value), rank: i + 1 }));
}

export async function joinContest(userId: string, pseudo: string, now = new Date()) {
  const month = monthKey(now);
  await db.insert(vpAccount).values({ userId, month, cash: START_CASH, pseudo }).onConflictDoUpdate({ target: [vpAccount.userId, vpAccount.month], set: { pseudo, updatedAt: now } });
  return month;
}

/** Ordre d'achat (qty > 0) ou de vente (qty < 0) au cours simulé du jour. Renvoie un message d'erreur, ou null si exécuté. */
export async function placeOrder(userId: string, stock: string, qty: number, now = new Date()): Promise<{ error: string } | { price: number; cash: number; held: number }> {
  const month = monthKey(now);
  const price = priceMap(now)[stock];
  if (!price) return { error: 'Société inconnue.' };
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(vpAccount).where(and(eq(vpAccount.userId, userId), eq(vpAccount.month, month))).for('update');
    if (!a) return { error: 'Inscrivez-vous d’abord au concours du mois.' };
    const held = a.positions[stock] ?? 0;
    if (qty > 0 && qty * price > a.cash) return { error: 'Liquidités insuffisantes.' };
    if (qty < 0 && held < -qty) return { error: 'Vous ne détenez pas assez de titres.' };
    const positions = { ...a.positions, [stock]: held + qty };
    if (!positions[stock]) delete positions[stock];
    const cash = a.cash - qty * price;
    await tx.update(vpAccount).set({ cash, positions, updatedAt: now }).where(and(eq(vpAccount.userId, userId), eq(vpAccount.month, month)));
    await tx.insert(vpTrade).values({ userId, month, stock, qty, price, at: now });
    return { price, cash, held: held + qty };
  });
}

/** Fige le classement du mois précédent et prévient chaque participant de son rang (appelé chaque jour par /api/cron/rappels). */
export async function closePreviousMonth(now = new Date()) {
  const month = previousMonth(monthKey(now));
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(vpAccount).where(and(eq(vpAccount.month, month), isNull(vpAccount.finalRank)));
  if (!open) return { month, closed: 0 };
  const rows = await ranking(month, now);
  for (const r of rows) {
    await db.update(vpAccount).set({ finalRank: r.rank, finalValue: r.value }).where(and(eq(vpAccount.userId, r.userId), eq(vpAccount.month, month)));
    const podium = r.rank <= 3 ? ` Bravo, vous êtes sur le podium (${r.rank === 1 ? '1re' : `${r.rank}e`} place) !` : '';
    await notify(r.userId, `Concours de portefeuille virtuel ${ofMonth(month)} : vous terminez ${r.rank}e sur ${rows.length} (${r.perf >= 0 ? '+' : ''}${r.perf.toLocaleString('fr-FR')} %).${podium}`, '/kapital/portefeuille-virtuel');
  }
  return { month, closed: rows.length };
}
