/* Santé de la plateforme (CDC §13 : supervision de disponibilité, alertes) : vérifications réelles, utilisées par /api/sante
   (sondes de supervision externes) et la page publique /statut. Aucune valeur secrète n'est exposée. */
import { sql } from 'drizzle-orm';
import { db } from './db';
import { env } from './env';

export type Check = { id: string; label: string; state: 'ok' | 'degrade' | 'ko' | 'non_configure'; detail: string; ms?: number };

export async function runChecks(): Promise<Check[]> {
  const t0 = Date.now();
  let dbCheck: Check;
  try {
    await db.execute(sql`select 1`);
    const ms = Date.now() - t0;
    dbCheck = { id: 'base', label: 'Base de données', state: ms > 1500 ? 'degrade' : 'ok', detail: `${ms} ms`, ms };
  } catch (e) {
    dbCheck = { id: 'base', label: 'Base de données', state: 'ko', detail: e instanceof Error ? e.message.slice(0, 80) : 'injoignable' };
  }
  const has = (...keys: string[]) => keys.every((k) => !!env(k));
  const conf = (id: string, label: string, ok: boolean, what: string): Check => ({ id, label, state: ok ? 'ok' : 'non_configure', detail: ok ? 'configuré' : `${what} non configuré` });
  return [
    dbCheck,
    conf('paiements', 'Paiements Mobile Money et cartes', has('CINETPAY_APIKEY', 'CINETPAY_SITE_ID'), 'agrégateur'),
    conf('email', 'E-mails', has('RESEND_API_KEY'), 'prestataire e-mail'),
    conf('sms', 'SMS', has('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'), 'prestataire SMS'),
    conf('whatsapp', 'WhatsApp', has('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'), 'WhatsApp Business'),
    conf('push', 'Notifications push', has('PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'), 'clés VAPID'),
    conf('stockage', 'Stockage des documents', has('S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'), 'stockage objet'),
    conf('ia', 'CEA Copilot (IA)', has('ANTHROPIC_API_KEY'), 'fournisseur IA'),
    conf('taches', 'Tâches planifiées', has('CRON_SECRET'), 'secret des tâches'),
  ];
}

/** État global : « ko » si la base est indisponible, « degrade » si elle est lente. */
export const overall = (checks: Check[]) => {
  const base = checks.find((c) => c.id === 'base')!;
  return base.state === 'ko' ? 'ko' : base.state === 'degrade' ? 'degrade' : 'ok';
};
export const version = () => env('VERCEL_GIT_COMMIT_SHA')?.slice(0, 7) ?? 'local';

/* Historique (CDC §13.1 : disponibilité 99,9 % par mois) : un échantillon au plus par minute, enregistré à chaque vérification.
   Une sonde externe qui appelle /api/sante toutes les 1 à 5 minutes suffit à produire une mesure fiable. Sans table (migration
   non appliquée), l'historique est simplement absent : la vérification en direct continue de fonctionner. */
export async function recordSample(checks: Check[]) {
  const base = checks.find((c) => c.id === 'base')!;
  const services = Object.fromEntries(checks.map((c) => [c.id, c.state]));
  try {
    await db.execute(sql`insert into health_sample (state, base_ms, services)
      select ${overall(checks)}, ${base.ms ?? null}, ${JSON.stringify(services)}::jsonb
      where not exists (select 1 from health_sample where at > now() - interval '1 minute')`);
    // Purge occasionnelle : 400 jours conservés (comparaison d'une année sur l'autre)
    if (Math.random() < 0.01) await db.execute(sql`delete from health_sample where at < now() - interval '400 days'`);
  } catch { /* historique indisponible : sans effet sur la réponse */ }
}

export type Uptime = { since: string | null; samples: number; byService: Record<string, number> };
/** Disponibilité par service sur N jours : part des vérifications où le service répondait (ralenti compris).
    Un service « pas encore activé » n'entre pas dans le calcul. */
export async function uptime(days = 90): Promise<Uptime | null> {
  try {
    const [head] = (await db.execute(sql`select min(at) as since, count(*)::int as n from health_sample where at > now() - make_interval(days => ${days})`)).rows as { since: string | null; n: number }[];
    if (!head?.n) return { since: null, samples: 0, byService: {} };
    const rows = (await db.execute(sql`select key, count(*) filter (where value in ('ok', 'degrade'))::float as up, count(*) filter (where value <> 'non_configure')::float as tot
      from health_sample, jsonb_each_text(services) where at > now() - make_interval(days => ${days}) group by key`)).rows as { key: string; up: number; tot: number }[];
    return { since: head.since, samples: head.n, byService: Object.fromEntries(rows.filter((r) => r.tot > 0).map((r) => [r.key, (r.up / r.tot) * 100])) };
  } catch { return null; }
}
