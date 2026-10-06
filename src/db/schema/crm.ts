/* CRM 360° et campagnes (CDC §12).
   Les membres sont des contacts à part entière (user + profile) ; crm_contact ne porte que les personnes sans compte
   (partenaires, sponsors, presse, institutions), avec la base légale de leur consentement. */
import { pgTable, pgEnum, text, boolean, integer, bigint, timestamp, uuid, jsonb, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { user } from './auth';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const crmOrgKindEnum = pgEnum('crm_org_kind', ['entreprise', 'bailleur', 'banque', 'fondation', 'institution', 'media', 'universite', 'association', 'autre']);
export const crmOrg = pgTable('crm_org', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: crmOrgKindEnum('kind').notNull().default('entreprise'),
  country: text('country'),
  sector: text('sector'),
  website: text('website'),
  notes: text('notes'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('crm_org_name_idx').on(t.name)]);

export const crmContact = pgTable('crm_contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  orgId: uuid('org_id').references(() => crmOrg.id, { onDelete: 'set null' }),
  role: text('role'), // fonction dans l'organisation
  country: text('country'),
  sector: text('sector'),
  lang: text('lang').notNull().default('fr'),
  tags: text('tags').array().notNull().default([]),
  source: text('source'), // salon, recommandation, site…
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  consentBasis: text('consent_basis'), // comment le consentement a été recueilli (preuve)
  consentAt: ts('consent_at'),
  notes: text('notes'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('crm_contact_email_unique').on(t.email), index('crm_contact_org_idx').on(t.orgId)]);

/* Interactions : appels, réunions, e-mails, notes — sur un membre (userId) ou un contact externe (contactId), et/ou une organisation */
export const crmInteraction = pgTable('crm_interaction', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => crmContact.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => crmOrg.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id'),
  kind: text('kind').notNull(), // appel, reunion, email, note, evenement
  summary: text('summary').notNull(),
  at: ts('at').notNull().defaultNow(),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
}, (t) => [index('crm_interaction_user_idx').on(t.userId), index('crm_interaction_contact_idx').on(t.contactId), index('crm_interaction_org_idx').on(t.orgId)]);

/* Pipeline partenaires et sponsors */
export const crmDealStageEnum = pgEnum('crm_deal_stage', ['prospect', 'contact', 'proposition', 'negociation', 'gagne', 'perdu']);
export const crmDeal = pgTable('crm_deal', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => crmOrg.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('partenariat'), // partenariat, sponsoring, subvention
  stage: crmDealStageEnum('stage').notNull().default('prospect'),
  amountXof: bigint('amount_xof', { mode: 'number' }),
  eventId: text('event_id'), // sponsoring d'un événement
  programme: text('programme'), // programme cofinancé (identifiant du programme, comme cohort.programme) : rapport d'impact du partenaire
  expectedOn: date('expected_on'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('crm_deal_stage_idx').on(t.stage)]);

/* Segments dynamiques : des règles (pas une liste figée), évaluées au moment de l'envoi — voir src/lib/segments.ts */
export const crmSegment = pgTable('crm_segment', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  rules: jsonb('rules').notNull().default({}),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* ===== Campagnes : e-mail, SMS, WhatsApp, push ; modèles ; test A/B ; statistiques par destinataire ===== */
export const campaignChannelEnum = pgEnum('campaign_channel', ['email', 'sms', 'whatsapp', 'push']);
export const campaignStatusEnum = pgEnum('campaign_status', ['brouillon', 'programmee', 'envoi', 'envoyee', 'annulee']);
export const campaignTemplate = pgTable('campaign_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  channel: campaignChannelEnum('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const campaign = pgTable('campaign', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  channel: campaignChannelEnum('channel').notNull(),
  purpose: text('purpose').notNull().default('marketing'), // marketing (consentement requis) ou service (relation existante : billet, inscription)
  segmentId: uuid('segment_id').references(() => crmSegment.id, { onDelete: 'set null' }),
  subject: text('subject'),
  body: text('body').notNull().default(''),
  url: text('url'), // lien principal (push, SMS)
  // Test A/B : variante B et part des destinataires qui la reçoivent (0 = pas de test)
  subjectB: text('subject_b'),
  bodyB: text('body_b'),
  splitB: integer('split_b').notNull().default(0),
  status: campaignStatusEnum('status').notNull().default('brouillon'),
  scheduledAt: ts('scheduled_at'),
  startedAt: ts('started_at'),
  sentAt: ts('sent_at'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const campaignSend = pgTable('campaign_send', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  recipientKey: text('recipient_key').notNull(), // u:<membre>, c:<contact>, n:<abonné à la lettre>
  address: text('address'), // e-mail ou téléphone au moment de l'envoi
  name: text('name'),
  variant: text('variant').notNull().default('A'),
  status: text('status').notNull().default('en_attente'), // en_attente, envoye, echec
  error: text('error'),
  sentAt: ts('sent_at'),
  openedAt: ts('opened_at'),
  clickedAt: ts('clicked_at'),
  unsubscribedAt: ts('unsubscribed_at'),
}, (t) => [uniqueIndex('campaign_send_unique').on(t.campaignId, t.recipientKey), index('campaign_send_status_idx').on(t.campaignId, t.status)]);
