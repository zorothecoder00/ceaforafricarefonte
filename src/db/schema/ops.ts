/* Exploitation et observabilité (CDC §13) : historique des vérifications de santé, pour la disponibilité publiée sur /statut. */
import { pgTable, text, integer, timestamp, bigserial, jsonb, index, real, boolean } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* Un échantillon par vérification (au plus un par minute) : état global, latence de la base et état de chaque service.
   Alimenté par les appels de la sonde externe sur /api/sante et par les affichages de /statut. Conservé 400 jours. */
export const healthSample = pgTable('health_sample', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  state: text('state').notNull(), // ok | degrade | ko
  baseMs: integer('base_ms'),
  services: jsonb('services').$type<Record<string, string>>().notNull().default({}),
}, (t) => [index('health_sample_at_idx').on(t.at)]);

/* Mesures de terrain des Core Web Vitals (CDC §13.1 : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 au 75e centile, mobile).
   Envoyées par un échantillon de navigateurs, sans cookie ni identifiant : chemin de la page, métrique, valeur, type d'appareil. */
export const webVital = pgTable('web_vital', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  path: text('path').notNull(),
  metric: text('metric').notNull(), // LCP | INP | CLS
  value: real('value').notNull(),
  mobile: boolean('mobile').notNull(),
  lite: boolean('lite').notNull().default(false),
}, (t) => [index('web_vital_at_idx').on(t.at)]);
