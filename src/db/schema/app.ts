/* Données de la plateforme CEA FOR AFRICA (schéma public). Les contenus éditoriaux (cours, événements…) restent
   pour l'instant dans src/data et sont référencés ici par leur identifiant texte (ex. « c1 », « e1 »). */
import { pgTable, pgEnum, text, boolean, integer, bigint, timestamp, uuid, jsonb, primaryKey, index, uniqueIndex, date, bigserial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
  cvKey: text('cv_key'), // CV déposé (stockage privé)
  recruiterVisible: boolean('recruiter_visible').notNull().default(false), // visible des recruteurs vérifiés (CDC §7.4)
  // Étudiants et jeunes diplômés (CDC §7.4, stages et alternance)
  school: text('school'),
  degree: text('degree'),
  studyLevel: text('study_level'),
  availableFrom: date('available_from'),
  availableUntil: date('available_until'),
  // Préférences de notification (CDC §10) : canaux par catégorie et heures de silence — voir src/lib/notify.ts
  notifPrefs: jsonb('notif_prefs').notNull().default({}),
  // Suspension par l'équipe (back-office › Membres) : connexion refusée et sessions fermées tant qu'elle dure
  suspendedAt: ts('suspended_at'),
  suspendedReason: text('suspended_reason'),
  suspendedBy: text('suspended_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* Consentements séparés et révocables (CDC §15.1) */
export const consentKindEnum = pgEnum('consent_kind', ['compte', 'profil_public', 'marketing', 'partage_investisseurs', 'cookies_mesure', 'contacts_sponsors']);
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

/* Avis sur un cours (CDC §7.6) : réservés aux inscrits, un avis par personne, masquables par la modération. */
export const courseReview = pgTable('course_review', {
  userId: userRef('user_id').notNull(),
  courseId: text('course_id').notNull(),
  rating: integer('rating').notNull(), // 1 à 5
  comment: text('comment'),
  hidden: boolean('hidden').notNull().default(false),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.courseId] }), index('course_review_course_idx').on(t.courseId)]);

export const certificate = pgTable('certificate', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(), // vérifiable par QR
  userId: userRef('user_id').notNull(),
  subject: text('subject').notNull(), // identifiant du cours ou du parcours
  title: text('title').notNull(),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
});

/* Séries de jours d'apprentissage (CDC §7.6, ludification) : un jour = au moins une leçon ou un quiz validé ce jour-là (UTC) */
export const learningDay = pgTable('learning_day', {
  userId: userRef('user_id').notNull(),
  day: date('day').notNull(),
  actions: integer('actions').notNull().default(1),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

/* Tests de compétences et badges vérifiés (CDC §7.4) : questions tirées et corrigées côté serveur, durée limitée.
   Le badge obtenu est un certificat (sujet « test:<id> »), vérifiable par QR comme les certificats de cours. */
export const skillTestAttempt = pgTable('skill_test_attempt', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  testId: text('test_id').notNull(),
  questions: integer('questions').array().notNull(), // indices des questions tirées, dans l'ordre présenté
  startedAt: ts('started_at').notNull().defaultNow(),
  submittedAt: ts('submitted_at'),
  score: integer('score'),
  passed: boolean('passed'),
}, (t) => [index('skill_test_attempt_user_idx').on(t.userId, t.testId)]);

/* Apprentissage en cohorte (CDC §7.6) : promotion d'un cours avec sessions en direct, devoirs et évaluation par les pairs */
export const academyCohort = pgTable('academy_cohort', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: text('course_id').notNull(),
  name: text('name').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  seats: integer('seats'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('academy_cohort_course_idx').on(t.courseId)]);

export const academyCohortMember = pgTable('academy_cohort_member', {
  cohortId: uuid('cohort_id').notNull().references(() => academyCohort.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  joinedAt: ts('joined_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.cohortId, t.userId] })]);

export const academySession = pgTable('academy_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id').notNull().references(() => academyCohort.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startsAt: ts('starts_at').notNull(),
  minutes: integer('minutes').notNull().default(60),
  link: text('link'), // visio fournie ; sinon salle Jitsi générée
  replay: text('replay'),
});

export const academyAssignment = pgTable('academy_assignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id').notNull().references(() => academyCohort.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  instructions: text('instructions').notNull(),
  dueAt: ts('due_at').notNull(),
  reviewsRequired: integer('reviews_required').notNull().default(2), // évaluations de pairs que chacun doit rendre
});

export const academySubmission = pgTable('academy_submission', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull().references(() => academyAssignment.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('academy_submission_unique').on(t.assignmentId, t.userId)]);

export const academyReview = pgTable('academy_review', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').notNull().references(() => academySubmission.id, { onDelete: 'cascade' }),
  reviewerId: userRef('reviewer_id').notNull(),
  score: integer('score'), // 1 à 5 ; null tant que l'évaluation attribuée n'est pas rendue
  comment: text('comment'),
  assignedAt: ts('assigned_at').notNull().defaultNow(),
  doneAt: ts('done_at'),
}, (t) => [uniqueIndex('academy_review_unique').on(t.submissionId, t.reviewerId)]);

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
export const sessionKindEnum = pgEnum('session_kind', ['mentorat', 'expert']);
export const mentoringSession = pgTable('mentoring_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: sessionKindEnum('kind').notNull().default('mentorat'),
  priceXof: bigint('price_xof', { mode: 'number' }).notNull().default(0),
  paymentId: uuid('payment_id'),
  goal: text('goal'),
  mentorNotes: text('mentor_notes'), // confidentiel : mentor, entrepreneur, chargé de programme (CDC §7.6)
  mentorId: userRef('mentor_id').notNull(),
  menteeId: userRef('mentee_id').notNull(),
  startsAt: ts('starts_at').notNull(),
  status: mentoringStatusEnum('status').notNull().default('demandee'),
  menteeRating: integer('mentee_rating'),
  remindedAt: ts('reminded_at'), // rappel de la veille envoyé (tâche planifiée /api/cron/rappels)
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
  holderEmail: text('holder_email'), // billet transféré à une personne sans compte : envoyé à cette adresse
  status: ticketStatusEnum('status').notNull().default('valide'),
  paymentId: uuid('payment_id').references(() => payment.id, { onDelete: 'set null' }),
  checkedInAt: ts('checked_in_at'),
  // Accord du participant : les sponsors qui scannent son badge reçoivent son nom et son e-mail (retirable à tout moment)
  sponsorConsent: boolean('sponsor_consent').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('event_ticket_event_idx').on(t.eventId)]);

/* Collecte de contacts par les sponsors (CDC §7.3) : l'équipe ouvre un accès « stand » à un représentant de chaque sponsor ;
   il scanne les badges ; les coordonnées ne lui sont montrées que si le participant a donné son accord (sponsorConsent). */
export const eventSponsorAccess = pgTable('event_sponsor_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').notNull(),
  sponsorName: text('sponsor_name').notNull(),
  userId: userRef('user_id').notNull(), // représentant du sponsor (compte membre)
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('event_sponsor_access_unique').on(t.eventId, t.userId)]);

export const eventLead = pgTable('event_lead', {
  id: uuid('id').primaryKey().defaultRandom(),
  accessId: uuid('access_id').notNull().references(() => eventSponsorAccess.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => eventTicket.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('event_lead_unique').on(t.accessId, t.ticketId)]);

/* Alertes de fréquentation déjà envoyées à l'équipe (une par événement et par type), pour ne pas les répéter chaque jour */
export const eventAlert = pgTable('event_alert', {
  eventId: text('event_id').notNull(),
  kind: text('kind').notNull(), // complet_prevu, surreservation
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.kind] })]);

/* Programme personnel, rencontres B2B et après-événement (CDC §7.3) */
export const eventAgenda = pgTable('event_agenda', {
  userId: userRef('user_id').notNull(),
  eventId: text('event_id').notNull(),
  session: text('session').notNull(), // « jour-heure » de la session
}, (t) => [primaryKey({ columns: [t.userId, t.eventId, t.session] })]);

export const b2bProfile = pgTable('b2b_profile', {
  eventId: text('event_id').notNull(),
  userId: userRef('user_id').notNull(),
  offer: text('offer').notNull(),
  need: text('need').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const b2bMeetingStatusEnum = pgEnum('b2b_meeting_status', ['demandee', 'acceptee', 'refusee', 'annulee']);
export const b2bMeeting = pgTable('b2b_meeting', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').notNull(),
  requesterId: userRef('requester_id').notNull(),
  targetId: userRef('target_id').notNull(),
  slot: text('slot').notNull(), // « 1-16:20 » (jour-heure)
  note: text('note'),
  status: b2bMeetingStatusEnum('status').notNull().default('demandee'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('b2b_meeting_event_idx').on(t.eventId)]);

export const eventFeedback = pgTable('event_feedback', {
  eventId: text('event_id').notNull(),
  userId: userRef('user_id').notNull(),
  rating: integer('rating').notNull(), // 1 à 5
  nps: integer('nps'), // 0 à 10
  comment: text('comment'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

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
  // Stages et alternance (CDC §7.4) : date de début, durée, niveau d'études visé, tuteur désigné
  startDate: date('start_date'),
  durationMonths: integer('duration_months'),
  studyLevel: text('study_level'),
  tutor: text('tutor'),
  status: jobStatusEnum('status').notNull().default('en_moderation'),
  featured: boolean('featured').notNull().default(false),
  publishedAt: ts('published_at'),
  expiresAt: ts('expires_at'),
  moderationNote: text('moderation_note'), // motif du refus, communiqué au recruteur
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

/* Domaines d'intervention gérés par l'équipe (back-office › Domaines d'intervention) : ils s'ajoutent à ceux du code ;
   une ligne de même identifiant qu'un domaine du code le remplace (modification d'un domaine existant). */
export const domain = pgTable('domain', {
  id: text('id').primaryKey(), // identifiant d'adresse : /domaines/<id>
  icon: text('icon').notNull().default('info'),
  name: text('name').notNull(), // nom du service, ex. « CEA Events »
  dom: text('dom').notNull(), // intitulé du domaine, ex. « Événements »
  summary: text('summary').notNull(), // phrase courte des cartes et du méga-menu
  highlight: text('highlight').notNull().default(''), // chiffre ou accroche en bas de carte
  link: text('link'), // page du parcours ; à défaut, la page du domaine
  audience: text('audience').notNull().default(''),
  method: text('method').array().notNull().default([]),
  deliverables: text('deliverables').array().notNull().default([]),
  position: integer('position').notNull().default(100),
  active: boolean('active').notNull().default(true),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* Outils du recruteur (CDC §7.4) : équipe de recrutement d'une offre, notes d'équipe sur un candidat, entretiens planifiés,
   réponses types personnelles. Le candidat ne voit jamais les notes ; il voit ses entretiens. */
export const jobRecruiter = pgTable('job_recruiter', {
  jobId: uuid('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  addedAt: ts('added_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.jobId, t.userId] })]);

export const jobApplicationNote = pgTable('job_application_note', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => jobApplication.id, { onDelete: 'cascade' }),
  authorId: userRef('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('job_application_note_app').on(t.applicationId)]);

export const jobInterview = pgTable('job_interview', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => jobApplication.id, { onDelete: 'cascade' }),
  startsAt: ts('starts_at').notNull(),
  minutes: integer('minutes').notNull().default(45),
  mode: text('mode').notNull().default('visio'), // visio | presentiel | telephone
  place: text('place'), // adresse, numéro ou lien de visio
  createdBy: userRef('created_by').notNull(),
  cancelledAt: ts('cancelled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('job_interview_app').on(t.applicationId)]);

export const recruiterTemplate = pgTable('recruiter_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

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
  response: text('response'), // suite donnée, publiée (suivi public)
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
export const proposalSupport = pgTable('proposal_support', {
  proposalId: uuid('proposal_id').notNull().references(() => proposal.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.proposalId, t.userId] })]);

/* Groupes de travail (commissions thématiques) */
export const workingGroupMember = pgTable('working_group_member', {
  group: text('group').notNull(),
  userId: userRef('user_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.group, t.userId] })]);

/* Baromètre trimestriel du climat des affaires : réponses individuelles jamais publiées, seuls les agrégats (n ≥ 10) le sont */
export const barometerResponse = pgTable('barometer_response', {
  quarter: text('quarter').notNull(), // 2026-T4
  userId: userRef('user_id').notNull(),
  country: text('country'),
  sector: text('sector'),
  answers: jsonb('answers').notNull(), // { activite, tresorerie, credit, emploi, administration } de 1 à 5
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.quarter, t.userId] })]);

/* ===== Contact, signalements, lettre d'information, notifications ===== */
export const ticketFlowEnum = pgEnum('request_status', ['nouveau', 'en_cours', 'traite', 'clos']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['basse', 'normale', 'haute', 'urgente']);
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
  // Suivi des tickets (CDC §10 centre d'aide, §12 support) : priorité, assignation, échéance (SLA), satisfaction
  priority: ticketPriorityEnum('priority').notNull().default('normale'),
  assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
  dueAt: ts('due_at'),
  answeredAt: ts('answered_at'), // première réponse de l'équipe
  csat: integer('csat'), // satisfaction 1 à 5, donnée par le demandeur une fois la demande traitée
  csatComment: text('csat_comment'),
  // Workflows (CDC §12) : relance du responsable avant l'échéance, escalade après dépassement — une seule fois chacune
  remindedAt: ts('reminded_at'),
  escalatedAt: ts('escalated_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('contact_message_user_idx').on(t.userId)]);

/* Fil d'échanges d'un ticket : réponses de l'équipe et du demandeur. */
export const ticketReply = pgTable('ticket_reply', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => contactMessage.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  fromStaff: boolean('from_staff').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('ticket_reply_message_idx').on(t.messageId)]);

/* « Cet article vous a-t-il aidé ? » (base de connaissances du centre d'aide) : votes anonymes. */
export const helpFeedback = pgTable('help_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  article: text('article').notNull(),
  helpful: boolean('helpful').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('help_feedback_article_idx').on(t.article)]);

/* Rendez-vous en visio avec une équipe CEA (CDC §6.2, page Contact) : un créneau ne peut être réservé qu'une fois par équipe. */
export const appointment = pgTable('appointment', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  team: text('team').notNull(),
  at: ts('at').notNull(),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  topic: text('topic'),
  visio: text('visio').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  cancelledAt: ts('cancelled_at'),
  remindedAt: ts('reminded_at'), // rappel de la veille envoyé (tâche planifiée /api/cron/rappels)
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('appointment_at_idx').on(t.at), uniqueIndex('appointment_slot_unique').on(t.team, t.at).where(sql`${t.cancelledAt} is null`)]);

/* Vote électronique en assemblée (CDC §7.1, RÉG) : un bulletin par votant et par assemblée, signé par un code à usage unique.
   « proof » = empreinte SHA-256 du bulletin (assemblée, votant, choix, horodatage, aléa), remise au votant comme preuve de vote. */
export const agBallot = pgTable('ag_ballot', {
  id: uuid('id').primaryKey().defaultRandom(),
  assembly: text('assembly').notNull(),
  userId: userRef('user_id').notNull(),
  choices: jsonb('choices').$type<string[]>().notNull(),
  proof: text('proof').notNull().unique(),
  method: text('method').notNull(), // sms, whatsapp, email
  ip: text('ip'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('ag_ballot_unique').on(t.assembly, t.userId)]);

/* Brouillons des formulaires en étapes (CDC §10 « formulaires intelligents » : reprise sur un autre appareil). */
export const formDraft = pgTable('form_draft', {
  userId: userRef('user_id').notNull(),
  formId: text('form_id').notNull(),
  data: jsonb('data').notNull().default({}),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.formId] })]);

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

/* Abonnements aux notifications push (CDC §10) : un par navigateur ou téléphone autorisé ; supprimé quand le service push l'invalide. */
export const pushSubscription = pgTable('push_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  device: text('device'), // libellé lisible (navigateur, système) pour la liste des appareils
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('push_subscription_user_idx').on(t.userId)]);

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

/* ===== Mentors et experts (profils publics) ===== */
export const mentorProfile = pgTable('mentor_profile', {
  userId: userRef('user_id').primaryKey(),
  kind: sessionKindEnum('kind').notNull().default('mentorat'),
  expertise: text('expertise').notNull(),
  sectors: text('sectors').array().notNull().default([]),
  languages: text('languages').array().notNull().default([]),
  timezone: text('timezone').notNull().default('Africa/Lome'),
  priceXof: bigint('price_xof', { mode: 'number' }).notNull().default(0),
  slots: jsonb('slots').notNull().default([]), // créneaux hebdomadaires proposés
  rating: integer('rating'), // note moyenne × 10
  active: boolean('active').notNull().default(true),
});

/* ===== Communauté (CDC §7.8) : espaces, fil, messagerie, blocages ===== */
export const space = pgTable('space', {
  id: text('id').primaryKey(), // slug
  name: text('name').notNull(),
  description: text('description'),
  kind: text('kind').notNull().default('theme'), // pays, secteur, profil, theme
  country: text('country'),
});
export const spaceMember = pgTable('space_member', {
  spaceId: text('space_id').notNull().references(() => space.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  joinedAt: ts('joined_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.spaceId, t.userId] })]);

export const post = pgTable('post', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: userRef('author_id').notNull(),
  spaceId: text('space_id').references(() => space.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  status: text('status').notNull().default('publie'), // publie, en_moderation, masque
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('post_created_idx').on(t.createdAt)]);
export const postLike = pgTable('post_like', {
  postId: uuid('post_id').notNull().references(() => post.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const conversation = pgTable('conversation', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  isGroup: boolean('is_group').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const conversationMember = pgTable('conversation_member', {
  conversationId: uuid('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  lastReadAt: ts('last_read_at'),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);
export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
  senderId: userRef('sender_id').notNull(),
  body: text('body').notNull(),
  attachmentKey: text('attachment_key'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('message_conv_idx').on(t.conversationId, t.createdAt)]);

export const userBlock = pgTable('user_block', {
  blockerId: userRef('blocker_id').notNull(),
  blockedId: userRef('blocked_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

/* ===== Mastermind Circles (CDC §7.5) ===== */
export const circle = pgTable('circle', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  stage: text('stage').notNull(),
  lang: text('lang').notNull().default('fr'),
  format: text('format').notNull().default('en_ligne'),
  facilitatorId: text('facilitator_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const circleMember = pgTable('circle_member', {
  circleId: uuid('circle_id').notNull().references(() => circle.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
}, (t) => [primaryKey({ columns: [t.circleId, t.userId] })]);
export const circleSession = pgTable('circle_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => circle.id, { onDelete: 'cascade' }),
  startsAt: ts('starts_at').notNull(),
  agenda: text('agenda'),
  minutes: text('minutes'), // compte rendu visible des seuls membres du cercle
  ratings: jsonb('ratings').notNull().default({}), // évaluation de la séance par chaque membre (1 à 5)
});
export const commitmentStatusEnum = pgEnum('commitment_status', ['en_cours', 'atteint', 'reporte']);
export const circleCommitment = pgTable('circle_commitment', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => circle.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  text: text('text').notNull(),
  quarter: text('quarter').notNull(), // ex. 2026-T4
  status: commitmentStatusEnum('status').notNull().default('en_cours'),
});

/* ===== Project Studio (CDC §7.2) ===== */
export const projectStatusEnum = pgEnum('project_status', ['brouillon', 'soumis', 'en_structuration', 'pret_investissement', 'transmis_kapital', 'finance', 'archive']);
export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: userRef('owner_id').notNull(),
  name: text('name').notNull(),
  sector: text('sector'),
  country: text('country'),
  stage: text('stage'),
  sheet: jsonb('sheet').notNull().default({}), // fiche normalisée : problème, solution, marché, équipe, modèle, besoins, impact
  maturity: jsonb('maturity').notNull().default({}), // score sur 8 dimensions (0 à 5)
  finance: jsonb('finance').notNull().default({}), // hypothèses du modèle financier
  status: projectStatusEnum('status').notNull().default('brouillon'),
  public: boolean('public').notNull().default(false), // publication au portefeuille : accord explicite du porteur
  dossierId: uuid('dossier_id'), // passerelle vers Kapital Invest
  officerId: text('officer_id').references(() => user.id, { onDelete: 'set null' }), // chargé de programme qui suit le projet
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('project_owner_idx').on(t.ownerId)]);

export const canvasKindEnum = pgEnum('canvas_kind', ['bmc', 'lean', 'swot', 'arbre_problemes', 'cadre_logique', 'theorie_changement']);
export const projectCanvas = pgTable('project_canvas', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  kind: canvasKindEnum('kind').notNull(),
  data: jsonb('data').notNull().default({}),
  version: integer('version').notNull().default(1), // chaque enregistrement crée une version (comparaison possible)
  savedBy: text('saved_by').references(() => user.id, { onDelete: 'set null' }),
  savedAt: ts('saved_at').notNull().defaultNow(),
}, (t) => [index('project_canvas_idx').on(t.projectId, t.kind, t.version)]);

export const taskStatusEnum = pgEnum('task_status', ['a_faire', 'en_cours', 'termine']);
export const projectTask = pgTable('project_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: taskStatusEnum('status').notNull().default('a_faire'),
  owner: text('owner'),
  startOn: date('start_on'),
  dueOn: date('due_on'),
  milestone: boolean('milestone').notNull().default(false),
  dependsOn: uuid('depends_on'),
  budgetXof: bigint('budget_xof', { mode: 'number' }),
  spentXof: bigint('spent_xof', { mode: 'number' }),
  position: integer('position').notNull().default(0),
});

export const projectComment = pgTable('project_comment', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  authorId: userRef('author_id').notNull(),
  section: text('section'), // rubrique commentée de la fiche
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const projectMember = pgTable('project_member', {
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  role: text('role').notNull().default('membre'), // membre, expert (revue), partenaire (lecture)
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })]);

export const projectDoc = pgTable('project_doc', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  version: integer('version').notNull().default(1),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
});

/* Appels à compétences publiés par les projets */
export const skillCall = pgTable('skill_call', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  need: text('need').notNull(),
  kind: text('kind').notNull().default('expert'), // associe, expert, prestataire
  open: boolean('open').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const skillCallResponse = pgTable('skill_call_response', {
  callId: uuid('call_id').notNull().references(() => skillCall.id, { onDelete: 'cascade' }),
  userId: userRef('user_id').notNull(),
  message: text('message'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.callId, t.userId] })]);

/* ===== Favoris, alertes, billetterie avancée ===== */
export const savedItem = pgTable('saved_item', {
  userId: userRef('user_id').notNull(),
  kind: text('kind').notNull(), // job, course, event, article
  itemId: text('item_id').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.kind, t.itemId] })]);

export const jobAlert = pgTable('job_alert', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef('user_id').notNull(),
  query: jsonb('query').notNull().default({}),
  channel: text('channel').notNull().default('whatsapp'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const promoCode = pgTable('promo_code', {
  code: text('code').primaryKey(),
  eventId: text('event_id'),
  percent: integer('percent').notNull(),
  maxUses: integer('max_uses'),
  used: integer('used').notNull().default(0),
  expiresAt: ts('expires_at'),
});

export const eventWaitlist = pgTable('event_waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').notNull(),
  email: text('email').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  notifiedAt: ts('notified_at'), // prévenu·e qu'une place s'est libérée
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('event_waitlist_unique').on(t.eventId, t.email)]);

/* ===== Registre des usages de l'IA (CDC §11, gouvernance) : un appel au modèle = une ligne, sans le contenu échangé.
   Sert au suivi interne (volumes, coûts, replis) et à la partie publique du registre (/ia : volumes par usage). */
export const aiUsage = pgTable('ai_usage', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  feature: text('feature').notNull(), // copilot, orientation, redaction, tuteur, analyse, matching…
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  outcome: text('outcome').notNull(), // ok, refus, erreur
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('ai_usage_feature_idx').on(t.feature, t.createdAt)]);

/* ===== Notes produites par l'IA pour l'équipe (CDC §11) : pré-analyse d'un dossier Kapital, avis de modération…
   L'IA propose et documente, l'équipe décide : ces notes ne déclenchent aucune action et restent internes. */
export const aiNote = pgTable('ai_note', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectType: text('subject_type').notNull(), // dossier, post, job
  subjectId: text('subject_id').notNull(),
  feature: text('feature').notNull(), // analyse, moderation
  content: jsonb('content').notNull(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('ai_note_subject_idx').on(t.subjectType, t.subjectId, t.createdAt)]);

/* ===== CMS éditorial (CDC §12) : contenus par blocs, multilingues, avec circuit de validation et historique.
   Une même « clé » regroupe les versions linguistiques d'un contenu (FR, EN). Publication programmée : statut « programme »
   et date publishAt — le contenu devient visible à cette date, sans tâche planifiée. */
export const cmsStatusEnum = pgEnum('cms_status', ['brouillon', 'en_relecture', 'valide', 'programme', 'publie', 'archive']);
export const cmsContent = pgTable('cms_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull().default('article'), // article, event, course, page
  key: text('key').notNull(), // regroupe les versions FR/EN
  slug: text('slug').notNull(),
  lang: text('lang').notNull().default('fr'),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  category: text('category'),
  country: text('country'), // « Panafricain » ou nom de pays
  blocks: jsonb('blocks').notNull().default([]),
  data: jsonb('data').notNull().default({}), // champs propres au type (événement : date, lieu, billets… ; cours : leçons, quiz…)
  coverId: uuid('cover_id'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  featured: boolean('featured').notNull().default(false),
  status: cmsStatusEnum('status').notNull().default('brouillon'),
  publishAt: ts('publish_at'),
  publishedAt: ts('published_at'),
  version: integer('version').notNull().default(1),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('cms_content_slug_unique').on(t.type, t.lang, t.slug), uniqueIndex('cms_content_key_lang_unique').on(t.key, t.lang), index('cms_content_status_idx').on(t.type, t.status)]);

/* Historique : un instantané complet à chaque enregistrement ou changement d'état, pour comparer et restaurer */
export const cmsRevision = pgTable('cms_revision', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => cmsContent.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: cmsStatusEnum('status').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  note: text('note'),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('cms_revision_content_idx').on(t.contentId, t.version)]);

/* Médiathèque : images publiques des contenus (texte alternatif obligatoire, crédit) */
export const cmsMedia = pgTable('cms_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  name: text('name').notNull(),
  alt: text('alt').notNull(),
  credit: text('credit'),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Textes et images du site modifiés depuis l'éditeur visuel : remplacement d'un texte (ou d'un attribut : lien, image…)
   sur une page (« /a-propos », « /en/a-propos ») ou sur tout le site (« * »). La clé dérive du type et du texte d'origine. */
export const siteText = pgTable('site_text', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  kind: text('kind').notNull(), // 'text' ou nom d'attribut (href, src, alt, title, placeholder, data-countdown)
  original: text('original').notNull(),
  value: text('value').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('site_text_scope_key_idx').on(t.scope, t.key)]);

/* Matrice des droits modifiable (CDC §18) : écarts par rapport à la matrice par défaut de src/lib/rbac.ts.
   rights = sous-ensemble de « LCMV », suffixe « * » pour les éléments propres ou assignés, chaîne vide = aucun accès. */
export const roleRight = pgTable('role_right', {
  role: text('role').notNull(),
  obj: text('obj').notNull(),
  rights: text('rights').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.role, t.obj] })]);
