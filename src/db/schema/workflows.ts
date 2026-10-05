/* Constructeur de formulaires, workflows et automatisations, gestion documentaire (CDC §12). */
import { pgTable, pgEnum, text, boolean, integer, timestamp, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ===== Formulaires sans code : champs conditionnels, règles de routage, accusé de réception.
   Chaque réponse devient un ticket du support (contact_message) routé vers l'équipe : statut, responsable, délai, réponses. */
export const formStatusEnum = pgEnum('form_status', ['brouillon', 'publie', 'clos']);
export const formDef = pgTable('form_def', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  intro: text('intro').notNull().default(''),
  fields: jsonb('fields').notNull().default([]), // [{ key, label, kind, options, required, showIf: { field, equals } | null }]
  routing: jsonb('routing').notNull().default([]), // [{ field, equals, team, priority }] — première règle vérifiée
  defaultTeam: text('default_team').notNull().default('Accueil'),
  delay: text('delay').notNull().default('2 jours ouvrés'), // délai de réponse annoncé (SLA)
  ack: text('ack').notNull().default('Merci, votre demande est bien reçue.'),
  requireLogin: boolean('require_login').notNull().default(false),
  status: formStatusEnum('status').notNull().default('brouillon'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const formSubmission = pgTable('form_submission', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id').notNull().references(() => formDef.id, { onDelete: 'cascade' }),
  ticketRef: text('ticket_ref').notNull(), // référence du ticket créé (contact_message.reference)
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  data: jsonb('data').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('form_submission_form_idx').on(t.formId, t.createdAt)]);

/* ===== Automatisations « si … alors … » : un événement, des conditions, des actions ; chaque exécution est journalisée */
export const automation = pgTable('automation', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  event: text('event').notNull(), // formulaire.soumis, ticket.cree, candidature.recue, paiement.reussi
  conditions: jsonb('conditions').notNull().default([]), // [{ field, op: egal|contient|existe, value }]
  actions: jsonb('actions').notNull().default([]), // [{ type: notifier_role|email|assigner|priorite|webhook, … }]
  active: boolean('active').notNull().default(true),
  secret: text('secret').notNull(), // signature des webhooks (HMAC)
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const automationRun = pgTable('automation_run', {
  id: uuid('id').primaryKey().defaultRandom(),
  automationId: uuid('automation_id').notNull().references(() => automation.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  subject: text('subject'), // référence de l'objet (ticket, candidature, paiement)
  ok: boolean('ok').notNull(),
  detail: text('detail'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('automation_run_idx').on(t.automationId, t.at)]);

/* ===== Gestion documentaire : dossiers avec droits par rôle, fichiers versionnés, liens de partage expirables, journal ===== */
export const docFolder = pgTable('doc_folder', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  readers: text('readers').array().notNull().default([]), // rôles autorisés à consulter
  writers: text('writers').array().notNull().default([]), // rôles autorisés à déposer et classer
  watermark: boolean('watermark').notNull().default(true), // filigrane nominatif sur les PDF téléchargés
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const docFile = pgTable('doc_file', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => docFolder.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  tags: text('tags').array().notNull().default([]),
  version: integer('version').notNull().default(1),
  archived: boolean('archived').notNull().default(false),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('doc_file_folder_idx').on(t.folderId)]);
export const docVersion = pgTable('doc_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull().references(() => docFile.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  note: text('note'),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('doc_version_unique').on(t.fileId, t.version)]);
export const docShare = pgTable('doc_share', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull().references(() => docFile.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  recipient: text('recipient').notNull(), // nom ou e-mail, inscrit dans le filigrane
  expiresAt: ts('expires_at').notNull(),
  maxDownloads: integer('max_downloads'),
  downloads: integer('downloads').notNull().default(0),
  revokedAt: ts('revoked_at'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const docLog = pgTable('doc_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').references(() => docFile.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id'),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  shareId: uuid('share_id'),
  action: text('action').notNull(), // depot, version, telechargement, partage, revocation, deplacement, archivage
  detail: text('detail'),
  ip: text('ip'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('doc_log_file_idx').on(t.fileId, t.at)]);
