/* Abonnement aux notifications push (CDC §10) pour l'appareil courant.
   POST   { endpoint, keys: { p256dh, auth }, device? } → enregistre (ou rattache au membre connecté) l'abonnement du navigateur
   DELETE { endpoint }                                   → désabonne cet appareil
   GET                                                   → clé publique VAPID et nombre d'appareils abonnés */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { pushSubscription } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { pushPublicKey } from '../../lib/push';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const [n] = await db.select({ n: count() }).from(pushSubscription).where(eq(pushSubscription.userId, u.id));
  return json({ ok: true, key: pushPublicKey() ?? null, devices: n?.n ?? 0 });
};

const Sub = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith('https://'), 'Adresse de service push invalide'),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  device: z.string().max(120).optional(),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  if (!pushPublicKey()) return fail('Les notifications push ne sont pas encore disponibles.', 503);
  const p = Sub.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Abonnement invalide.');
  const v = { userId: u.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, device: p.data.device ?? null };
  // Un même navigateur partagé passe au dernier membre connecté
  await db.insert(pushSubscription).values(v).onConflictDoUpdate({ target: pushSubscription.endpoint, set: v });
  return json({ ok: true, message: 'Notifications activées sur cet appareil.' });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  await db.delete(pushSubscription).where(and(eq(pushSubscription.userId, u.id), eq(pushSubscription.endpoint, p.data.endpoint)));
  return json({ ok: true, message: 'Notifications désactivées sur cet appareil.' });
};
