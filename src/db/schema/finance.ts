/* Finance, analytique et paramétrage (CDC §12).
   - Factures : numérotation continue par année (FAC-2026-000001), une facture par paiement réussi, factures manuelles (sponsoring),
     avoirs pour les remboursements. Une facture émise ne se modifie pas : on l'annule par un avoir.
   - Rapprochement : comparaison des paiements enregistrés avec le relevé de l'agrégateur.
   - Rapports enregistrés (constructeur de rapports), réglages, modèles de messages, redirections. */
import { pgTable, pgEnum, text, integer, bigint, timestamp, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { payment } from './app';
import { crmOrg } from './crm';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const invoiceKindEnum = pgEnum('invoice_kind', ['facture', 'avoir']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['a_payer', 'payee', 'annulee']);
export const invoice = pgTable('invoice', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(), // FAC-2026-000001 / AV-2026-000001
  year: integer('year').notNull(),
  seq: integer('seq').notNull(),
  kind: invoiceKindEnum('kind').notNull().default('facture'),
  paymentId: uuid('payment_id').references(() => payment.id, { onDelete: 'restrict' }),
  originalId: uuid('original_id'), // avoir : facture d'origine
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => crmOrg.id, { onDelete: 'set null' }),
  buyer: jsonb('buyer').notNull(), // { name, email, company?, taxId?, address? } figé à l'émission
  lines: jsonb('lines').notNull(), // [{ label, qty, unitXof, account }]
  purpose: text('purpose').notNull(), // objet comptable (adhesion, billet, cours, sponsoring…)
  totalHtXof: bigint('total_ht_xof', { mode: 'number' }).notNull(),
  taxRate: integer('tax_rate').notNull().default(0), // en pour mille (180 = 18 %)
  taxXof: bigint('tax_xof', { mode: 'number' }).notNull().default(0),
  totalXof: bigint('total_xof', { mode: 'number' }).notNull(), // TTC (négatif pour un avoir)
  status: invoiceStatusEnum('status').notNull().default('payee'),
  paidAt: ts('paid_at'),
  paymentMethod: text('payment_method'),
  dueOn: text('due_on'),
  notes: text('notes'),
  issuedBy: text('issued_by').references(() => user.id, { onDelete: 'set null' }),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  country: text('country'), // analytique CEA OS : pays et domaine d'intervention
  domain: text('domain'),
}, (t) => [uniqueIndex('invoice_year_seq').on(t.kind, t.year, t.seq), uniqueIndex('invoice_payment_unique').on(t.paymentId, t.kind), index('invoice_user_idx').on(t.userId)]);

/* Rapprochement avec le relevé de l'agrégateur : résumé et écarts relevés (aucune écriture automatique) */
export const reconciliation = pgTable('reconciliation', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  fileName: text('file_name').notNull(),
  periodFrom: text('period_from'),
  periodTo: text('period_to'),
  summary: jsonb('summary').notNull(), // { matched, mismatched, missingHere, missingThere, pending }
  items: jsonb('items').notNull(), // écarts détaillés
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Rapports enregistrés (constructeur de rapports) */
export const savedReport = pgTable('saved_report', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  spec: jsonb('spec').notNull(), // { dataset, groupBy, measure, from, to, country }
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Réglages (clé → valeur), modèles de messages, redirections */
export const setting = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const messageTemplate = pgTable('message_template', {
  key: text('key').primaryKey(), // ex. candidature.admise
  subject: text('subject'),
  body: text('body').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const redirect = pgTable('redirect', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromPath: text('from_path').notNull().unique(),
  toUrl: text('to_url').notNull(),
  code: integer('code').notNull().default(301),
  hits: integer('hits').notNull().default(0),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
