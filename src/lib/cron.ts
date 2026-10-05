/* Tâches planifiées (Vercel Cron, voir vercel.json) : appel protégé par CRON_SECRET
   (en-tête Authorization: Bearer …, ajouté automatiquement par Vercel). */
import { timingSafeEqual } from 'node:crypto';
import { env } from './env';

export function cronAuthorized(h: string | null) {
  const secret = env('CRON_SECRET');
  if (!secret || !h) return false;
  const want = Buffer.from(`Bearer ${secret}`), got = Buffer.from(h);
  return want.length === got.length && timingSafeEqual(want, got);
}
