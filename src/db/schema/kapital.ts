/* Données de CEA KAPITAL INVEST, isolées dans le schéma PostgreSQL « kapital » (CDC §4.1 et §13 :
   cloisonnement des données financières, droits et journaux spécifiques). */
import { pgSchema, text, boolean, integer, bigint, timestamp, uuid, jsonb, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const kapital = pgSchema('kapital');
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* Pipeline d'un dossier (CDC §8.3) */
export const dossierStatusEnum = kapital.enum('dossier_status', [
  'recu', 'incomplet', 'preselectionne', 'diagnostic', 'en_preparation', 'revue_analyste', 'comite', 'pret_presentation', 'mis_en_relation', 'finance', 'cloture',
]);
export const instrumentEnum = kapital.enum('instrument', [
  'actions_ordinaires', 'actions_preference', 'safe_bsa_air', 'obligations_convertibles', 'dette_privee', 'mezzanine', 'financement_islamique', 'subvention',
]);
export const verificationLevelEnum = kapital.enum('verification_level', ['declaratif', 'diligence_en_cours', 'verifie']);

export const dossier = kapital.table('dossier', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(), // D-2026-0412
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  analystId: text('analyst_id').references(() => user.id, { onDelete: 'set null' }),
  companyName: text('company_name').notNull(),
  country: text('country').notNull(),
  rccm: text('rccm'),
  sector: text('sector'),
  stage: text('stage'),
  amountXof: bigint('amount_xof', { mode: 'number' }),
  instrument: instrumentEnum('instrument'),
  useOfFunds: text('use_of_funds'),
  traction: text('traction'),
  team: text('team'),
  status: dossierStatusEnum('status').notNull().default('recu'),
  verification: verificationLevelEnum('verification').notNull().default('declaratif'),
  investorReadyScore: integer('investor_ready_score'),
  shareConsent: boolean('share_consent').notNull().default(false), // privé par défaut, partage révocable
  published: boolean('published').notNull().default(false), // résumé visible des investisseurs vérifiés
  page: jsonb('page'), // page d'opportunité composée par l'entreprise (vidéo, équipe, traction, fonds…) — src/lib/opportunity-page.ts
  accessDays: integer('access_days').notNull().default(90), // durée d'accès à la data room après signature de l'accord
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('dossier_status_idx').on(t.status), index('dossier_owner_idx').on(t.ownerId)]);

/* Historique des changements de statut (responsable, délai, traçabilité) */
export const dossierEvent = kapital.table('dossier_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  fromStatus: dossierStatusEnum('from_status'),
  toStatus: dossierStatusEnum('to_status').notNull(),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  note: text('note'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('dossier_event_dossier_idx').on(t.dossierId)]);

/* Diagnostic « Suis-je prêt ? » (8 axes) */
export const diagnostic = kapital.table('diagnostic', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  dossierId: uuid('dossier_id').references(() => dossier.id, { onDelete: 'set null' }),
  answers: integer('answers').array().notNull(),
  score: integer('score').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Profil investisseur et vérification (CDC §8.10) */
export const investorCategoryEnum = kapital.enum('investor_category', ['particulier', 'averti', 'professionnel']);
export const kycStatusEnum = kapital.enum('kyc_status', ['non_commence', 'en_cours', 'verifie', 'refuse', 'expire']);
export const investorProfile = kapital.table('investor_profile', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  category: investorCategoryEnum('category'),
  sectors: text('sectors').array().notNull().default([]),
  countries: text('countries').array().notNull().default([]),
  ticketMinXof: bigint('ticket_min_xof', { mode: 'number' }),
  ticketMaxXof: bigint('ticket_max_xof', { mode: 'number' }),
  kycStatus: kycStatusEnum('kyc_status').notNull().default('non_commence'),
  verifiedAt: ts('verified_at'),
  nextReviewAt: ts('next_review_at'),
});

/* Contrôles KYC/KYB : uniquement des références au prestataire, jamais les pièces elles-mêmes */
export const kycCheckKindEnum = kapital.enum('kyc_check_kind', ['identite', 'vivacite', 'sanctions', 'pep', 'origine_fonds', 'kyb_immatriculation', 'kyb_beneficiaires']);
export const kycCheck = kapital.table('kyc_check', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  dossierId: uuid('dossier_id').references(() => dossier.id, { onDelete: 'cascade' }),
  kind: kycCheckKindEnum('kind').notNull(),
  status: kycStatusEnum('status').notNull().default('en_cours'),
  provider: text('provider'),
  providerRef: text('provider_ref'),
  checkedAt: ts('checked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Accords de confidentialité et data room (CDC §8.9) */
export const nda = kapital.table('nda', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  signedAt: ts('signed_at').notNull().defaultNow(),
  signatureRef: text('signature_ref'),
  revokedAt: ts('revoked_at'),
  expiresAt: ts('expires_at'), // accès à la data room fermé après cette date (prolongeable par l'entreprise)
  expiryNoticeAt: ts('expiry_notice_at'), // préavis d'expiration envoyé à l'investisseur
}, (t) => [uniqueIndex('nda_unique').on(t.dossierId, t.investorId)]);

/* Questions-réponses de la data room (CDC §8.9) : un investisseur sous accord pose une question, l'entreprise ou l'équipe répond ;
   une réponse partagée est visible de tous les investisseurs sous accord, sans le nom de l'auteur de la question. */
export const dataRoomQuestion = kapital.table('data_room_question', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer'),
  answeredBy: text('answered_by').references(() => user.id, { onDelete: 'set null' }),
  answeredAt: ts('answered_at'),
  shared: boolean('shared').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('data_room_question_dossier_idx').on(t.dossierId)]);

export const dataRoomFolderEnum = kapital.enum('data_room_folder', ['juridique', 'financier', 'commercial', 'technique', 'rh', 'fiscal', 'esg']);
export const dataRoomDocument = kapital.table('data_room_document', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  folder: dataRoomFolderEnum('folder').notNull(),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(), // objet chiffré (stockage compatible S3)
  version: integer('version').notNull().default(1),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
});

export const dataRoomView = kapital.table('data_room_view', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => dataRoomDocument.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  seconds: integer('seconds').notNull().default(0),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('data_room_view_doc_idx').on(t.documentId)]);

/* Manifestations d'intérêt (non engageantes, avant agrément) */
export const interest = kapital.table('interest', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  investorId: text('investor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  amountXof: bigint('amount_xof', { mode: 'number' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('interest_unique').on(t.dossierId, t.investorId)]);

export const watchlist = kapital.table('watchlist', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  item: text('item').notNull(), // dossier:<uuid>, indice:brvm, societe:<nom>
  alertPct: integer('alert_pct'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.item] })]);

/* Concours mensuel de portefeuille virtuel (CDC §8.6) : 10 M FCFA fictifs par membre et par mois, ordres exécutés côté serveur
   au cours simulé du jour (src/lib/marche-simule.ts). Aucun gain financier. */
export const vpAccount = kapital.table('vp_account', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  month: text('month').notNull(), // AAAA-MM
  cash: bigint('cash', { mode: 'number' }).notNull(),
  positions: jsonb('positions').$type<Record<string, number>>().notNull().default({}),
  pseudo: text('pseudo').notNull(), // nom affiché au classement (choisi par le membre)
  finalRank: integer('final_rank'), // rang définitif, fixé au début du mois suivant
  finalValue: bigint('final_value', { mode: 'number' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.month] }), index('vp_account_month_idx').on(t.month)]);

export const vpTrade = kapital.table('vp_trade', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  stock: text('stock').notNull(),
  qty: integer('qty').notNull(), // positif = achat, négatif = vente
  price: integer('price').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('vp_trade_user_idx').on(t.userId, t.month)]);

/* Comité d'investissement */
export const committeeDecisionEnum = kapital.enum('committee_decision_kind', ['favorable', 'defavorable', 'ajourne']);
export const committeeDecision = kapital.table('committee_decision', {
  id: uuid('id').primaryKey().defaultRandom(),
  dossierId: uuid('dossier_id').notNull().references(() => dossier.id, { onDelete: 'cascade' }),
  meetingOn: ts('meeting_on').notNull(),
  decision: committeeDecisionEnum('decision').notNull(),
  minutes: text('minutes'),
  conflicts: jsonb('conflicts').notNull().default([]), // déclarations de conflits d'intérêts
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Interrupteurs des fonctions réglementées par pays (CDC §8.11) — fermées par défaut */
export const featureFlag = kapital.table('feature_flag', {
  country: text('country').notNull(),
  feature: text('feature').notNull(), // kap_intro, kap_sub, kap_sec, kap_pop, kap_lp, kap_ord, vote
  enabled: boolean('enabled').notNull().default(false),
  legalNote: text('legal_note'),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.country, t.feature] })]);
