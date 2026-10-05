/* Notifications push Web Push (CDC §10) : envoi à tous les appareils abonnés d'un membre, signé par les clés VAPID.
   Les abonnements refusés par le service push (expirés, désinstallés : 404/410) sont supprimés.
   Sans clés VAPID, le push est simplement désactivé (les autres canaux continuent de fonctionner). */
import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { pushSubscription } from '../db/schema/app';
import { env } from './env';

export const pushPublicKey = () => env('PUBLIC_VAPID_PUBLIC_KEY');

let ready: boolean | undefined;
function configure() {
  if (ready !== undefined) return ready;
  const pub = pushPublicKey(), priv = env('VAPID_PRIVATE_KEY');
  ready = !!(pub && priv);
  if (ready) webpush.setVapidDetails(env('VAPID_SUBJECT') ?? 'mailto:contact@cea4africa.com', pub!, priv!);
  return ready;
}

export type PushMessage = { title: string; body?: string; url?: string; tag?: string };

/** Envoie à chaque appareil du membre ; renvoie le nombre d'envois acceptés. */
export async function sendPush(userId: string, msg: PushMessage) {
  if (!configure()) return 0;
  const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  if (!subs.length) return 0;
  const payload = JSON.stringify({ title: msg.title, body: msg.body ?? '', url: msg.url ?? '/espace/notifications', tag: msg.tag });
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
      else console.error('[push] envoi impossible :', code ?? (e instanceof Error ? e.message : e));
    }
  }));
  if (gone.length) await db.delete(pushSubscription).where(inArray(pushSubscription.id, gone));
  return sent;
}
