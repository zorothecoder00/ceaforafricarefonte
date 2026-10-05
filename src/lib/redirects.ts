/* Redirections d'adresses (CDC §12, paramétrage) : anciennes adresses, liens imprimés, campagnes.
   Appliquées par le middleware aux pages rendues à la demande (une ancienne adresse inexistante passe par la route générique).
   Table lue en cache 60 s ; compteur de passages mis à jour sans retarder la réponse. */
import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { redirect } from '../db/schema/finance';

let cache: { at: number; map: Map<string, { to: string; code: number }> } | undefined;
export const invalidateRedirects = () => { cache = undefined; };

/** Chemin normalisé : minuscules, sans barre finale. */
export const normPath = (p: string) => (p.replace(/\/+$/, '') || '/').toLowerCase();

/** Destination d'un chemin, ou null. Les chemins internes (API, back-office, espace, fichiers) ne sont jamais redirigés. */
export async function findRedirect(path: string) {
  const p = normPath(path);
  if (/^\/(api|admin|espace|_astro|media)(\/|$)/.test(p)) return null;
  if (!cache || Date.now() - cache.at > 60_000) {
    const rows = await db.select({ from: redirect.fromPath, to: redirect.toUrl, code: redirect.code }).from(redirect).catch(() => []);
    cache = { at: Date.now(), map: new Map(rows.map((r) => [normPath(r.from), { to: r.to, code: r.code }])) };
  }
  const hit = cache.map.get(p);
  if (hit) void db.update(redirect).set({ hits: sql`${redirect.hits} + 1` }).where(eq(redirect.fromPath, p)).catch(() => {});
  return hit ?? null;
}
