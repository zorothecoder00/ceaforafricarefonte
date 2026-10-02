/* Données de la plateforme CEA FOR AFRICA (schéma public). Les contenus éditoriaux (cours, événements…) restent
   pour l'instant dans src/data et sont référencés ici par leur identifiant texte (ex. « c1 », « e1 »). */
import { pgTable, pgEnum, text, boolean, integer, bigint, timestamp, uuid, jsonb, primaryKey, index, uniqueIndex, date, bigserial } from 'drizzle-orm/pg-core';
import { user } from './auth';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name: string) => text(name).references(() => user.id, { onDelete: 'cascade' });

/* ===== Rôles (CDC §18) : une personne peut cumuler plusieurs rôles ===== */
export const roleEnum = pgEnum('role', [
  'membre', 'entrepreneur', 'talent', 'employeur', 'mentor', 'investisseur', 'souscripteur', 'partenaire',
  'charge_programme', 'analyste', 'comite', 'conformite', 'editeur', 'responsable_pays', 'admin', 'direction',
]);
export const userRole = pgTable('user_role', {
  userId: userRef('user_id').notNull(),
  role: roleEnum('role').notNull(),
  country: text('country'), // pour responsable_pays : pays concerné
  grantedAt: ts('granted_at').notNull().defaultNow(),
  grantedBy: text('granted_by').references(() => user.id, { onDelete: 'set null' }),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

/* ===== Profil 360° (CDC §9.1) ===== */
export const visibilityEnum = pgEnum('visibility', ['public', 'membres', 'prive']);
export const profile = pgTable('profile', {
  userId: userRef('user_id').primaryKey(),
  headline: text('headline'),
  bio: text('bio'),
  country: text('country'), // code ISO (TG, CI…)
  city: text('city'),
  lang: text('lang').notNull().default('fr'),
  currency: text('currency').notNull().default('XOF'),
  sector: text('sector'),
  companyName: text('company_name'),
  skills: text('skills').array().notNull().default([]),
  needs: text('needs'),
  offers: text('offers'),
  visibility: visibilityEnum('visibility').notNull().default('membres'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* Consentements séparés et révocables (CDC §15.1) */
export const consentKindEnum = pgEnum('consent_kind', ['compte', 'profil_public', 'marketing', 'partage_investisseurs', 'cookies_mesure']);
export const consent = pgTable('consent', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  kind: consentKindEnum('kind').notNull(),
  granted: boolean('granted').notNull(),
  at: ts('at').notNull().defaultNow(),
  ip: text('ip'),
}, (t) => [index('consent_user_kind_idx').on(t.userId, t.kind)]);

/* ===== Adhésions et paiements (CDC §7.7, §10, §16) ===== */
export const planEnum = pgEnum('plan', ['gratuit', 'membre', 'premium', 'entreprise']);
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'expiree', 'annulee']);
export const membership = pgTable('membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  plan: planEnum('plan').notNull(),
  status: membershipStatusEnum('status').notNull().default('active'),
  cardNumber: text('card_number').notNull().unique(),
  startsAt: ts('starts_at').notNull().defaultNow(),
  endsAt: ts('ends_at'),
  paymentId: uuid('payment_id'),
}, (t) => [index('membership_user_idx').on(t.userId)]);

export const paymentPurposeEnum = pgEnum('payment_purpose', ['adhesion', 'billet', 'cours', 'programme', 'mastermind', 'expert', 'mise_en_avant', 'recherche', 'sponsoring']);
export const paymentStatusEnum = pgEnum('payment_status', ['en_attente', 'reussi', 'echoue', 'rembourse']);
export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  purpose: paymentPurposeEnum('purpose').notNull(),
  amountXof: bigint('amount_xof', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  provider: text('provider'), // agrégateur (CinetPay, PayDunya, FedaPay…)
  method: text('method'), // orange_money, mtn_momo, wave, mpesa, carte…
  providerRef: text('provider_ref'),
  status: paymentStatusEnum('status').notNull().default('en_attente'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  paidAt: ts('paid_at'),
}, (t) => [index('payment_user_idx').on(t.userId), index('payment_status_idx').on(t.status)]);

/* ===== Académie (CDC §7.6) ===== */
export const enrollment = pgTable('enrollment', {
  userId: userRef('user_id').notNull(),
  courseId: text('course_id').notNull(),
  completedLessons: integer('completed_lessons').array().notNull().default([]),
  startedAt: ts('started_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.courseId] })]);

export const certificate = pgTable('certificate', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(), // vérifiable par QR
  userId: userRef('user_id').notNull(),
  subject: text('subject').notNull(), // identifiant du cours ou du parcours
  title: text('title').notNull(),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
});

/* ===== Programmes et candidatures (CDC §7.6) ===== */
export const applicationStatusEnum = pgEnum('application_status', ['brouillon', 'recue', 'en_evaluation', 'entretien', 'admise', 'liste_attente', 'refusee', 'retiree']);
export const programmeApplication = pgTable('programme_application', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  userId: userRef('user_id').notNull(),
  programme: text('programme').notNull(), // accelerateur-c4, investor-ready, mastermind…
  status: applicationStatusEnum('status').notNull().default('recue'),
  data: jsonb('data').notNull().default({}),
  score: integer('score'),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('programme_application_user_idx').on(t.userId), index('programme_application_prog_idx').on(t.programme, t.status)]);

export const mentoringStatusEnum = pgEnum('mentoring_status', ['demandee', 'confirmee', 'realisee', 'annulee']);
export const mentoringSession = pgTable('mentoring_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  mentorId: userRef('mentor_id').notNull(),
  menteeId: userRef('mentee_id').notNull(),
  startsAt: ts('starts_at').notNull(),
  status: mentoringStatusEnum('status').notNull().default('demandee'),
  menteeRating: integer('mentee_rating'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* ===== Événements (CDC §7.3) ===== */
export const ticketStatusEnum = pgEnum('ticket_status', ['valide', 'utilise', 'rembourse', 'transfere', 'annule']);
export const eventTicket = pgTable('event_ticket', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // contenu du QR
  eventId: text('event_id').notNull(),
  ticketType: text('ticket_type').notNull(),
  priceXof: bigint('price_xof', { mode: 'number' }).notNull().default(0),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  holderName: text('holder_name'),
  status: ticketStatusEnum('status').notNull().default('valide'),
  paymentId: uuid('payment_id').references(() => payment.id, { onDelete: 'set null' }),
  checkedInAt: ts('checked_in_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('event_ticket_event_idx').on(t.eventId)]);

/* ===== CEA Talents (CDC §7.4) ===== */
export const jobTypeEnum = pgEnum('job_type', ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance', 'Mission']);
export const jobStatusEnum = pgEnum('job_status', ['brouillon', 'en_moderation', 'publiee', 'fermee', 'refusee']);
export const job = pgTable('job', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: text('employer_id').references(() => user.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  company: text('company').notNull(),
  country: text('country').notNull(),
  type: jobTypeEnum('type').notNull(),
  remote: boolean('remote').notNull().default(false),
  diaspora: boolean('diaspora').notNull().default(false),
  salary: text('salary'),
  skills: text('skills').array().notNull().default([]),
  description: text('description'),
  status: jobStatusEnum('status').notNull().default('en_moderation'),
  featured: boolean('featured').notNull().default(false),
  publishedAt: ts('published_at'),
  expiresAt: ts('expires_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('job_status_country_idx').on(t.status, t.country)]);

export const jobApplicationStatusEnum = pgEnum('job_application_status', ['envoyee', 'vue', 'entretien', 'offre', 'refus', 'retiree']);
export const jobApplication = pgTable('job_application', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  status: jobApplicationStatusEnum('status').notNull().default('envoyee'),
  note: text('note'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('job_application_unique').on(t.jobId, t.userId)]);

/* Mesure des emplois créés (vérification à 6 et 12 mois) */
export const hireDeclaration = pgTable('hire_declaration', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: userRef('employer_id').notNull(),
  personName: text('person_name').notNull(),
  contract: jobTypeEnum('contract').notNull(),
  hiredOn: date('hired_on').notNull(),
  country: text('country'),
  verified6mAt: ts('verified_6m_at'),
  verified12mAt: ts('verified_12m_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* ===== Voix des Entrepreneurs (CDC §7.7) ===== */
export const consultationVote = pgTable('consultation_vote', {
  consultationId: text('consultation_id').notNull(),
  userId: userRef('user_id').notNull(),
  optionIndex: integer('option_index').notNull(),
  votedAt: ts('voted_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.consultationId, t.userId] })]); // une voix par adhérent

export const proposalStatusEnum = pgEnum('proposal_status', ['deposee', 'en_discussion', 'adoptee', 'rejetee']);
export const proposal = pgTable('proposal', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  country: text('country'),
  theme: text('theme'),
  status: proposalStatusEnum('status').notNull().default('deposee'),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const proposalSupport = pgTable('proposal_support', {
  proposalId: uuid('proposal_id').notNull().references(() => proposal.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.proposalId, t.userId] })]);

/* ===== Contact, signalements, lettre d'information, notifications ===== */
export const ticketFlowEnum = pgEnum('request_status', ['nouveau', 'en_cours', 'traite', 'clos']);
export const contactMessage = pgTable('contact_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  motif: text('motif').notNull(),
  routedTeam: text('routed_team').notNull(),
  country: text('country'),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  message: text('message').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  status: ticketFlowEnum('status').notNull().default('nouveau'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const report = pgTable('report', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull(),
  url: text('url'),
  description: text('description').notNull(),
  contact: text('contact'),
  anonymous: boolean('anonymous').notNull().default(true),
  status: ticketFlowEnum('status').notNull().default('nouveau'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const newsletterSubscription = pgTable('newsletter_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  topics: text('topics').array().notNull().default([]),
  country: text('country'),
  lang: text('lang').notNull().default('fr'),
  confirmedAt: ts('confirmed_at'),
  unsubscribedAt: ts('unsubscribed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  title: text('title').notNull(),
  link: text('link'),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('notification_user_idx').on(t.userId, t.readAt)]);

/* ===== Journal d'audit horodaté et non modifiable (CDC §12) — protégé par un déclencheur SQL ===== */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  ip: text('ip'),
  meta: jsonb('meta').notNull().default({}),
}, (t) => [index('audit_log_at_idx').on(t.at)]);
