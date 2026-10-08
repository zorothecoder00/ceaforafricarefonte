/* Marché simulé des sociétés fictives de Kapital Invest (src/data STOCKS), en attendant des cours réels sous licence.
   Chaque jour de bourse (lundi–vendredi, date UTC), chaque titre varie selon un tirage pseudo-aléatoire calculé côté serveur
   avec une clé secrète : les cours des jours suivants sont imprévisibles, ce qui rend le concours de portefeuille équitable.
   Le cours de référence (STOCKS.p) est celui du jour d'ancrage ; les cours avant et après en découlent. */
import { createHmac } from 'node:crypto';
import { STOCKS } from '../data/site';

const DAY = 86_400_000;
const ANCHOR = Math.floor(Date.UTC(2026, 9, 1) / DAY); // 1er octobre 2026 : cours = STOCKS.p
const VOL = 0.016; // écart-type quotidien (≈ 1,6 %)

const secret = () => process.env.MARKET_SIM_SECRET || process.env.BETTER_AUTH_SECRET || 'cea-marche-simule';
const isTradingDay = (day: number) => { const w = new Date(day * DAY).getUTCDay(); return w !== 0 && w !== 6; };

/** Variation logarithmique du titre `name` le jour `day` (0 le week-end). */
function dailyReturn(name: string, day: number) {
  if (!isTradingDay(day)) return 0;
  const h = createHmac('sha256', secret()).update(`${name}|${day}`).digest();
  // Deux tirages uniformes → loi normale (Box-Muller), bornée à ±4 écarts-types
  const u1 = (h.readUInt32BE(0) + 1) / 2 ** 32, u2 = h.readUInt32BE(4) / 2 ** 32;
  const z = Math.max(-4, Math.min(4, Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)));
  return VOL * z + 0.0002; // légère tendance haussière de long terme
}

const cache = new Map<string, number>();
/** Cours de clôture du titre au jour `day` (numéro de jour UTC depuis 1970), arrondi au franc. */
export function closeOn(name: string, base: number, day: number): number {
  const k = `${name}|${day}`;
  const hit = cache.get(k);
  if (hit != null) return hit;
  let sum = 0;
  if (day >= ANCHOR) for (let d = ANCHOR + 1; d <= day; d++) sum += dailyReturn(name, d);
  else for (let d = day + 1; d <= ANCHOR; d++) sum -= dailyReturn(name, d);
  const p = Math.max(1, Math.round(base * Math.exp(sum)));
  if (cache.size > 5000) cache.clear();
  cache.set(k, p);
  return p;
}

export const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);
/** Dernier jour de bourse au plus tard le jour `day`. */
export function lastTradingDay(day: number) { let d = day; while (!isTradingDay(d)) d--; return d; }

export type SimStock = (typeof STOCKS)[number] & { prev: number };
/** Les sociétés fictives avec le cours du dernier jour de bourse (p) et la variation sur la séance précédente (ch, en %). */
export function stocksAt(at = new Date()): SimStock[] {
  const d = lastTradingDay(dayOf(at)), before = lastTradingDay(d - 1);
  return STOCKS.map((s) => {
    const p = closeOn(s.n, s.p, d), prev = closeOn(s.n, s.p, before);
    return { ...s, p, prev, ch: Math.round(((p / prev) - 1) * 1000) / 10 };
  });
}

/** Cours de chaque titre au dernier jour de bourse au plus tard à la date donnée (valorisation des portefeuilles). */
export function priceMap(at = new Date()): Record<string, number> {
  return Object.fromEntries(stocksAt(at).map((s) => [s.n, s.p]));
}
