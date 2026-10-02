/* Protections des formulaires publics : limitation de débit par adresse IP (par instance) et champ piège anti-robots. */
import { clientIp, fail } from './session';

const hits = new Map<string, number[]>();

/** Renvoie une Response 429 si l'IP dépasse `max` requêtes sur `windowSec` secondes pour cette clé. */
export function rateLimit(request: Request, key: string, max = 5, windowSec = 600): Response | null {
  const id = `${key}:${clientIp(request) ?? 'inconnue'}`;
  const now = Date.now();
  const list = (hits.get(id) ?? []).filter((t) => now - t < windowSec * 1000);
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > windowSec * 1000)) hits.delete(k);
  return list.length > max ? fail('Trop de demandes. Réessayez dans quelques minutes.', 429) : null;
}

/** Champ caché « website » : rempli uniquement par les robots. */
export const isBot = (body: Record<string, unknown> | null) => !!body && typeof body.website === 'string' && body.website.length > 0;

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}
