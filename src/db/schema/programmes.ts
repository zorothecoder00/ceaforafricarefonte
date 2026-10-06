/* Programmes et cohortes (CDC §12) : appels à candidatures, grilles d'évaluation, évaluation par plusieurs jurys, comités,
   cohortes, présence, jalons, suivi long terme. Les candidatures restent dans programme_application (colonne programme = slug de l'appel). */
import { pgTable, pgEnum, text, boolean, integer, bigint, timestamp, uuid, jsonb, index, uniqueIndex, primaryKey, date } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { programmeApplication } from './app';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name: string) => text(name).references(() => user.id, { onDelete: 'cascade' });

/* Appel à candidatures : grille [{ key, label, weight, hint }] (poids en %), formulaire [{ key, label, kind, required }] */
export const callStatusEnum = pgEnum('call_status', ['brouillon', 'ouvert', 'clos', 'archive']);
export const programmeCall = pgTable('programme_call', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(), // = programme_application.programme
  title: text('title').notNull(),
  programme: text('programme').notNull(), // nom du programme (Incubation, Accélérateur…)
  description: text('description').notNull().default(''),
  opensAt: ts('opens_at'),
  closesAt: ts('closes_at'),
  status: callStatusEnum('status').notNull().default('brouillon'),
  grid: jsonb('grid').notNull().default([]),
  fields: jsonb('fields').notNull().default([]),
  reviewsPerApp: integer('reviews_per_app').notNull().default(2),
  role: text('role'), // rôle attribué à l'admission (ex. entrepreneur)
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* Jurys d'un appel (membres de la plateforme, internes ou experts invités) */
export const callJury = pgTable('call_jury', {
  callId: uuid('call_id').notNull().references(() => programmeCall.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
  addedAt: ts('added_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.callId, t.userId] })]);

/* Évaluation d'une candidature par un juré : notes par critère (0 à 5), total pondéré sur 100, conflit d'intérêts déclaré */
export const evaluation = pgTable('evaluation', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => programmeApplication.id, { onDelete: 'cascade' }),
  juryId: userRef('jury_id').notNull(),
  scores: jsonb('scores').notNull().default({}),
  total: integer('total'), // null si conflit d'intérêts
  comment: text('comment'),
  conflict: boolean('conflict').notNull().default(false),
  submittedAt: ts('submitted_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('evaluation_unique').on(t.applicationId, t.juryId)]);

/* Comité de sélection : séance et procès-verbal ; les décisions sont les statuts des candidatures (tracés au journal d'audit) */
export const selectionCommittee = pgTable('selection_committee', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => programmeCall.id, { onDelete: 'cascade' }),
  heldOn: date('held_on').notNull(),
  members: text('members').notNull(),
  minutes: text('minutes').notNull().default(''),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Cohortes */
export const cohortStatusEnum = pgEnum('cohort_status', ['a_venir', 'en_cours', 'terminee']);
export const cohort = pgTable('cohort', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  programme: text('programme').notNull(),
  callId: uuid('call_id').references(() => programmeCall.id, { onDelete: 'set null' }),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  status: cohortStatusEnum('status').notNull().default('a_venir'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const cohortMemberStatusEnum = pgEnum('cohort_member_status', ['actif', 'abandon', 'diplome']);
export const cohortMember = pgTable('cohort_member', {
  cohortId: uuid('cohort_id').notNull().references(() => cohort.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  applicationId: uuid('application_id').references(() => programmeApplication.id, { onDelete: 'set null' }),
  status: cohortMemberStatusEnum('status').notNull().default('actif'),
  reason: text('reason'), // motif d'abandon
  joinedAt: ts('joined_at').notNull().defaultNow(),
  leftAt: ts('left_at'),
}, (t) => [primaryKey({ columns: [t.cohortId, t.userId] })]);

/* Séances de la cohorte et présence */
export const cohortSession = pgTable('cohort_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id').notNull().references(() => cohort.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('atelier'), // atelier, mentorat, demo_day, visite, autre
  at: ts('at').notNull(),
  durationMin: integer('duration_min').notNull().default(120),
  place: text('place'), // lieu ou lien de visio
}, (t) => [index('cohort_session_cohort_idx').on(t.cohortId, t.at)]);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'excuse']);
export const attendance = pgTable('attendance', {
  sessionId: uuid('session_id').notNull().references(() => cohortSession.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  status: attendanceStatusEnum('status').notNull(),
  markedBy: text('marked_by').references(() => user.id, { onDelete: 'set null' }),
  markedAt: ts('marked_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.sessionId, t.userId] })]);

/* Jalons de la cohorte et avancement de chaque participant (preuve déclarée, validation par l'équipe) */
export const milestone = pgTable('milestone', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id').notNull().references(() => cohort.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  dueOn: date('due_on'),
  position: integer('position').notNull().default(0),
});
export const milestoneStatusEnum = pgEnum('milestone_status', ['a_faire', 'declare', 'atteint', 'non_atteint']);
export const milestoneProgress = pgTable('milestone_progress', {
  milestoneId: uuid('milestone_id').notNull().references(() => milestone.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  status: milestoneStatusEnum('status').notNull().default('a_faire'),
  evidence: text('evidence'), // déclaration du participant (lien, explication)
  validatedBy: text('validated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.milestoneId, t.userId] })]);

/* Suivi long terme des anciens : indicateurs à 6, 12, 24 mois… (déclarés par l'ancien ou saisis par l'équipe) */
export const alumniFollowup = pgTable('alumni_followup', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id').notNull().references(() => cohort.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  monthsAfter: integer('months_after').notNull(), // 6, 12, 24, 36
  revenueXof: bigint('revenue_xof', { mode: 'number' }),
  employees: integer('employees'),
  fundsRaisedXof: bigint('funds_raised_xof', { mode: 'number' }),
  stillActive: boolean('still_active'),
  notes: text('notes'),
  source: text('source').notNull().default('equipe'), // equipe, declaration
  recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),
  recordedAt: ts('recorded_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('alumni_followup_unique').on(t.cohortId, t.userId, t.monthsAfter)]);

/* Questionnaires de suivi envoyés automatiquement à 3, 6 et 12 mois après la fin d'une cohorte (CDC §7.6, §7.9) :
   un envoi et une relance au plus par point de suivi ; la réponse est enregistrée dans alumni_followup. */
export const followupRequest = pgTable('followup_request', {
  cohortId: uuid('cohort_id').notNull().references(() => cohort.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  monthsAfter: integer('months_after').notNull(),
  sentAt: ts('sent_at').notNull().defaultNow(),
  remindedAt: ts('reminded_at'),
}, (t) => [primaryKey({ columns: [t.cohortId, t.userId, t.monthsAfter] })]);
