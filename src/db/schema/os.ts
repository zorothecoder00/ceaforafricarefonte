/* CEA OS — progiciel de gestion interne (prototype CEA OS), lot 1 : personnel, demandes soumises à approbation
   (congés, notes de frais, achats, dépenses, contrats, recrutements), délégations de signature, temps passés, budgets par domaine.
   Le profil d'accès d'un collaborateur découle de son poste (src/lib/os/ref.ts › profOf) : il n'est pas stocké. */
import { pgTable, text, integer, bigint, boolean, real, timestamp, uuid, jsonb, index, primaryKey } from 'drizzle-orm/pg-core';
import { user } from './auth';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* Collaborateurs de CEA FOR AFRICA (matricule EMP001…). Le compte de connexion est facultatif : un collaborateur
   sans compte figure dans l'annuaire, l'organigramme et la paie mais ne se connecte pas. */
export const staff = pgTable('staff', {
  id: text('id').primaryKey(), // EMP001
  userId: text('user_id').unique().references(() => user.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull().default(''),
  poste: text('poste').notNull(), // code du référentiel des postes (A1, B2, C14…)
  poste2: text('poste2'), // cumul ou intérim
  country: text('country').notNull(),
  domain: text('domain'), // domaine d'intervention (act, kap, prj…) pour les postes de département
  managerId: text('manager_id'), // responsable hiérarchique (matricule)
  grade: text('grade').notNull(),
  department: text('department').notNull().default(''),
  salary: bigint('salary', { mode: 'number' }).notNull().default(0), // brut mensuel
  leaveDays: real('leave_days').notNull().default(0), // solde de congés
  hireDate: ts('hire_date').notNull().defaultNow(),
  active: boolean('active').notNull().default(true),
  suspended: boolean('suspended').notNull().default(false), // revue des droits : accès suspendus
  onboarding: jsonb('onboarding').$type<boolean[]>(), // objectifs des 90 premiers jours (3 paliers)
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('staff_manager_idx').on(t.managerId), index('staff_country_idx').on(t.country)]);

export type Step = { l: string; st: 'attente' | 'ok' | 'rejet'; who?: string; whoId?: string; at?: string; com?: string };

/* Demandes soumises à un circuit d'approbation. Étapes (steps) calculées à la création selon le type et le montant
   (seuils de Processus et seuils) ; cur = étape en cours ; hist = [date, auteur, décision, commentaire]. */
export const osRequest = pgTable('os_request', {
  id: text('id').primaryKey(), // DEP-XXXXX, NDF-…, CONG-…, DA-…, CTRA-…, RECR-…, OFR-…
  type: text('type').notNull(), // dep | ndf | conge | achat | contrat | recrut | offre
  title: text('title').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull().default(0),
  country: text('country').notNull(),
  domain: text('domain'),
  byStaff: text('by_staff').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  steps: jsonb('steps').$type<Step[]>().notNull().default([]),
  cur: integer('cur').notNull().default(0),
  status: text('status').notNull().default('En approbation'),
  hist: jsonb('hist').$type<[string, string, string, string][]>().notNull().default([]),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('os_request_status_idx').on(t.status), index('os_request_by_idx').on(t.byStaff)]);

/* Délégations de signature : pendant une absence, les approbations du délégant sont aussi proposées au délégataire. */
export const osDelegation = pgTable('os_delegation', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromStaff: text('from_staff').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  toStaff: text('to_staff').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  start: ts('start').notNull().defaultNow(),
  until: ts('until').notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Temps passés par semaine, domaine et projet (facturation des bailleurs, coût complet des activités). */
export const osTimesheet = pgTable('os_timesheet', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: text('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  week: text('week').notNull(), // 2026-S41
  domain: text('domain').notNull(),
  project: text('project').notNull().default('Activité courante'),
  hours: real('hours').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('os_timesheet_staff_idx').on(t.staffId)]);

/* Budget annuel par domaine : voté, engagé (demandes et commandes), réalisé (paiements). */
export const osBudget = pgTable('os_budget', {
  year: integer('year').notNull(),
  domain: text('domain').notNull(),
  budget: bigint('budget', { mode: 'number' }).notNull().default(0),
  engaged: bigint('engaged', { mode: 'number' }).notNull().default(0),
  realised: bigint('realised', { mode: 'number' }).notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.year, t.domain] })]);
