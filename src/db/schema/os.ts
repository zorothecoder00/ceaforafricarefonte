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

/* ===== Lot 2 : collaboration (messagerie interne, agenda et réunions, tâches, registre des décisions) ===== */

/* Canaux de la messagerie interne. Portée : « * » toute l'organisation, dep:<département>, dom:<domaine>, reg:<région>,
   pays:<pays>, dm:<matricule>,<matricule> (message direct). */
export const osChannel = pgTable('os_channel', {
  id: text('id').primaryKey(), // general, dom_btp, reg_AO, pays_TG, dep_finance, dm_EMP001_EMP014
  name: text('name').notNull(),
  scope: text('scope').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const osMessage = pgTable('os_message', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  channelId: text('channel_id').notNull().references(() => osChannel.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('os_message_channel_idx').on(t.channelId, t.id)]);
/* Dernier message lu par canal (messages non lus du menu). */
export const osChannelSeen = pgTable('os_channel_seen', {
  staffId: text('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => osChannel.id, { onDelete: 'cascade' }),
  lastId: bigint('last_id', { mode: 'number' }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.staffId, t.channelId] })]);

/* Réunions : participants, ordre du jour, compte rendu, décisions (reportées au registre). */
export const osMeeting = pgTable('os_meeting', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  at: ts('at').notNull(),
  hour: text('hour').notNull(), // 09:00
  duration: integer('duration').notNull().default(60),
  place: text('place').notNull().default('Visio'),
  participants: jsonb('participants').$type<string[]>().notNull().default([]),
  agenda: text('agenda').notNull().default(''),
  minutes: text('minutes').notNull().default(''),
  decisions: jsonb('decisions').$type<string[]>().notNull().default([]),
  organizer: text('organizer').references(() => staff.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('os_meeting_at_idx').on(t.at)]);

/* Tâches (kanban À faire / En cours / Terminé). */
export const osTask = pgTable('os_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  owner: text('owner').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('À faire'),
  country: text('country'),
  domain: text('domain'),
  due: ts('due').notNull(),
  createdBy: text('created_by').references(() => staff.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('os_task_owner_idx').on(t.owner)]);

/* Registre des décisions : décidé (Direction générale), en attente de la DG, refusé. */
export const osDecision = pgTable('os_decision', {
  id: uuid('id').primaryKey().defaultRandom(),
  text: text('text').notNull(),
  status: text('status').notNull().default('En attente'),
  source: text('source').notNull().default(''), // réunion d'origine
  by: text('by').references(() => staff.id, { onDelete: 'set null' }),
  at: ts('at').notNull().defaultNow(),
});

/* ===== Lot 3 : pilotage (OKR, risques et audit, revue des droits, entretiens annuels, processus, pays ouverts) ===== */

/* Objectifs en cascade : l'avancement d'un parent est la moyenne de ses enfants. */
export const osOkr = pgTable('os_okr', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  level: text('level').notNull(), // Organisation | Département | Région | Pays | Fonction | Équipe
  parentId: uuid('parent_id'),
  owner: text('owner').references(() => staff.id, { onDelete: 'set null' }),
  progress: integer('progress').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Cartographie des risques (probabilité × impact) et missions d'audit interne. */
export const osRisk = pgTable('os_risk', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  domain: text('domain').notNull(),
  probability: integer('probability').notNull(),
  impact: integer('impact').notNull(),
  owner: text('owner').references(() => staff.id, { onDelete: 'set null' }),
  plan: text('plan').notNull().default(''),
  status: text('status').notNull().default('Ouvert'), // Ouvert | En traitement | Maîtrisé | Clos
  country: text('country'),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const osAudit = pgTable('os_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  status: text('status').notNull().default('Planifié'),
  findings: integer('findings').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Revue trimestrielle des droits : chaque responsable confirme ou retire les accès de son équipe. */
export const osReview = pgTable('os_review', {
  quarter: text('quarter').primaryKey(), // 2026-T4
  start: ts('start').notNull().defaultNow(),
  applied: boolean('applied').notNull().default(false),
});
export const osReviewItem = pgTable('os_review_item', {
  quarter: text('quarter').notNull().references(() => osReview.quarter, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  decision: text('decision').notNull(), // ok | ko
  by: text('by').references(() => staff.id, { onDelete: 'set null' }),
  at: ts('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.quarter, t.staffId] })]);

/* Entretiens annuels : indicateurs du poste figés, compétences communes (1 à 4), objectifs et besoins de formation. */
export const osInterview = pgTable('os_interview', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: text('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  managerId: text('manager_id').references(() => staff.id, { onDelete: 'set null' }),
  competences: jsonb('competences').$type<number[]>().notNull(),
  objectives: text('objectives').notNull().default(''),
  kpis: jsonb('kpis').$type<[string, string][]>().notNull().default([]),
  at: ts('at').notNull().defaultNow(),
});

/* Processus paramétrables (étapes, activation). */
export const osFlow = pgTable('os_flow', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  steps: jsonb('steps').$type<string[]>().notNull(),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  position: integer('position').notNull().default(0),
});

/* Pays ouverts depuis CEA OS (en plus du réseau du code) : bureau, devise, région. */
export const osCountry = pgTable('os_country', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  currency: text('currency').notNull().default('XOF'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* ===== Lot 4 : gestion (comptabilité SYSCOHADA, trésorerie, achats et stocks, contrats) ===== */

/* Écritures comptables (SYSCOHADA révisé) générées par les autres modules ou saisies en opérations diverses.
   lines : [compte, débit, crédit] ; journaux VE ventes, AC achats, BQ banque et Mobile Money, OD opérations diverses, PA paie. */
export const osLedger = pgTable('os_ledger', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  at: ts('at').notNull().defaultNow(),
  journal: text('journal').notNull(),
  label: text('label').notNull(),
  lines: jsonb('lines').$type<[string, number, number][]>().notNull(),
  country: text('country'),
  domain: text('domain'),
  ref: text('ref').notNull().default(''),
  createdBy: text('created_by'),
}, (t) => [index('os_ledger_at_idx').on(t.at), index('os_ledger_ref_idx').on(t.ref)]);

/* Clôture mensuelle : liste de contrôle par période (AAAA-MM) ; la dernière étape revient à la Direction générale. */
export const osClosing = pgTable('os_closing', {
  period: text('period').primaryKey(),
  items: jsonb('items').$type<boolean[]>().notNull(),
  closedAt: ts('closed_at'),
});

/* Comptes de trésorerie (banques, Mobile Money, caisse) : solde mis à jour d'après les relevés. */
export const osTreasury = pgTable('os_treasury', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  account: text('account').notNull(), // 521 banques, 585 Mobile Money, 571 caisse
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* Encaissements reçus (Mobile Money, virements) à rapprocher d'une facture. */
export const osReceipt = pgTable('os_receipt', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(), // Orange Money, MTN MoMo, Wave, Moov Money, Virement
  amount: bigint('amount', { mode: 'number' }).notNull(),
  ref: text('ref').notNull().default(''),
  at: ts('at').notNull().defaultNow(),
  status: text('status').notNull().default('Non rapproché'),
  invoiceId: uuid('invoice_id'),
  createdBy: text('created_by'),
});

/* Fournisseurs : coordonnées bancaires masquées, vérification par une seconde personne (double contrôle). */
export const osSupplier = pgTable('os_supplier', {
  id: text('id').primaryKey(), // FRN-10
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  country: text('country').notNull(),
  iban: text('iban').notNull().default(''),
  status: text('status').notNull().default('À vérifier'),
  createdBy: text('created_by'),
  verifiedBy: text('verified_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Articles en stock, mouvements, bons de commande. */
export const osStockItem = pgTable('os_stock_item', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  unit: text('unit').notNull(),
  qty: integer('qty').notNull().default(0),
  min: integer('min').notNull().default(0),
  country: text('country').notNull(),
  unitCost: bigint('unit_cost', { mode: 'number' }).notNull().default(0),
});
export const osStockMove = pgTable('os_stock_move', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().references(() => osStockItem.code, { onDelete: 'cascade' }),
  type: text('type').notNull(), // Entrée | Sortie
  qty: integer('qty').notNull(),
  ref: text('ref').notNull().default(''),
  by: text('by'),
  at: ts('at').notNull().defaultNow(),
});
export const osPo = pgTable('os_po', {
  id: text('id').primaryKey(), // BC-2026-071
  byStaff: text('by_staff'),
  supplierId: text('supplier_id').references(() => osSupplier.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  itemCode: text('item_code'),
  qty: integer('qty').notNull().default(0),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  country: text('country').notNull(),
  domain: text('domain'),
  status: text('status').notNull().default('Commandé'), // Commandé | Livré | Facturé
  requestId: text('request_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* Contrats : cycle de vie (circuit juridique, signature, échéance, renouvellement). */
export const osContract = pgTable('os_contract', {
  id: text('id').primaryKey(), // CTR-30
  title: text('title').notNull(),
  party: text('party').notNull(),
  type: text('type').notNull(),
  domain: text('domain'),
  country: text('country').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull().default(0),
  start: ts('start').notNull().defaultNow(),
  end: ts('end').notNull(),
  status: text('status').notNull().default('En signature'), // En signature | En vigueur | Échu
  owner: text('owner'),
  requestId: text('request_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* ===== Lot 5 : ressources humaines (paie, recrutement) ===== */

/* Paie mensuelle validée : une ligne par collaborateur (brut, cotisations salariales, impôt, net, charges patronales). */
export type PayLine = { id: string; brut: number; cs: number; imp: number; net: number; cp: number; country: string };
export const osPayroll = pgTable('os_payroll', {
  month: text('month').primaryKey(), // 2026-09
  lines: jsonb('lines').$type<PayLine[]>().notNull(),
  by: text('by'),
  at: ts('at').notNull().defaultNow(),
});

/* Recrutements : demande (circuit région ou DG puis RH), validation, annonce, candidatures, offre, embauche. */
export const osRecruit = pgTable('os_recruit', {
  id: text('id').primaryKey(), // REC-21
  poste: text('poste').notNull(),
  country: text('country').notNull(),
  byStaff: text('by_staff').references(() => staff.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('Demande'), // Demande | Validée | Publiée | Pourvu | Refusée
  salary: bigint('salary', { mode: 'number' }).notNull().default(0),
  why: text('why').notNull().default(''),
  requestId: text('request_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const osCandidate = pgTable('os_candidate', {
  id: uuid('id').primaryKey().defaultRandom(),
  recruitId: text('recruit_id').notNull().references(() => osRecruit.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  source: text('source').notNull().default('Candidature spontanée'),
  status: text('status').notNull().default('Nouvelle'), // Nouvelle | Entretien | Offre en approbation | Embauché·e | Non retenue
  scores: jsonb('scores').$type<Record<string, number>>(),
  evaluator: text('evaluator'),
  cv: jsonb('cv').$type<{ key: string; name: string }>(),
  at: ts('at').notNull().defaultNow(),
});

/* ===== Lot 6 : relations (inscriptions des membres, rapports mensuels des bureaux pays) ===== */

/* Inscriptions des entrepreneurs membres (formulaire public) : validation par le bureau pays sous 48 h, puis escalade
   au directeur régional. domains : codes des domaines d'intervention (act, kap…), le premier est le domaine principal. */
export const osInscription = pgTable('os_inscription', {
  id: text('id').primaryKey(), // MEM-TG-XXXXXX (numéro de suivi donné au demandeur)
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  company: text('company').notNull().default(''),
  country: text('country').notNull(),
  domains: jsonb('domains').$type<string[]>().notNull().default([]),
  source: text('source').notNull().default('Site web'),
  status: text('status').notNull().default('En attente'), // En attente | Validée | Rejetée
  reason: text('reason'),
  messageId: uuid('message_id'),
  userId: text('user_id'),
  slaFrom: ts('sla_from').notNull().defaultNow(), // départ du délai de 48 h (repart à zéro après une demande de compléments)
  decidedBy: text('decided_by'),
  decidedAt: ts('decided_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('os_inscription_status_idx').on(t.status)]);

/* Rapport mensuel d'un bureau pays (pré-rempli par CEA OS, commenté par le représentant, soumis au directeur régional). */
export const osReport = pgTable('os_report', {
  country: text('country').notNull(),
  period: text('period').notNull(), // 2026-09
  status: text('status').notNull().default('Brouillon'),
  comment: text('comment').notNull().default(''),
  submittedBy: text('submitted_by'),
  submittedAt: ts('submitted_at'),
}, (t) => [primaryKey({ columns: [t.country, t.period] })]);

/* ===== Lot 6 (2/2) : domaines d'intervention ===== */

/* CEA Events : budget et sponsors d'un événement du catalogue (inscrits, présents et recettes viennent de la billetterie). */
export const osEventFin = pgTable('os_event_fin', {
  eventId: text('event_id').primaryKey(),
  budget: bigint('budget', { mode: 'number' }).notNull().default(0),
  sponsors: integer('sponsors').notNull().default(0),
  sponsorship: bigint('sponsorship', { mode: 'number' }).notNull().default(0), // recettes de sponsoring
});

/* CEA Project Studio : portefeuille des projets conduits par CEA FOR AFRICA (bailleur, budget, jalons, santé). */
export const osProject = pgTable('os_project', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  domain: text('domain').notNull().default('prj'),
  funder: text('funder').notNull().default(''),
  budget: bigint('budget', { mode: 'number' }).notNull().default(0),
  spent: bigint('spent', { mode: 'number' }).notNull().default(0),
  progress: integer('progress').notNull().default(0),
  health: text('health').notNull().default('ok'), // ok | warn | bad
  milestones: jsonb('milestones').$type<[string, boolean][]>().notNull().default([]),
  next: ts('next'),
  owner: text('owner'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* CEA Actionnariat : PME accompagnées dans l'ouverture de leur capital. */
export const osCapital = pgTable('os_capital', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  stage: text('stage').notNull().default('Sensibilisation'), // Sensibilisation | Valorisation | Pacte d'associés | Recherche d'investisseurs | Opération réalisée | Transférée à Kapital
  valuation: bigint('valuation', { mode: 'number' }).notNull().default(0),
  share: integer('share').notNull().default(0), // part ouverte (%)
  createdAt: ts('created_at').notNull().defaultNow(),
});

/* CEA BTP & Infrastructures : chantiers, lots, journal, situations de travaux, sous-traitants, sécurité, appels d'offres. */
export const osSite = pgTable('os_site', {
  id: text('id').primaryKey(), // CH-201
  name: text('name').notNull(),
  country: text('country').notNull(),
  client: text('client').notNull().default(''), // maître d'ouvrage
  amount: bigint('amount', { mode: 'number' }).notNull(), // montant du marché
  start: ts('start').notNull().defaultNow(),
  end: ts('end').notNull(),
  manager: text('manager'), // conducteur de travaux (matricule)
  retention: integer('retention').notNull().default(5), // retenue de garantie (%)
  createdAt: ts('created_at').notNull().defaultNow(),
});
export const osSiteLot = pgTable('os_site_lot', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').notNull().references(() => osSite.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  budget: bigint('budget', { mode: 'number' }).notNull().default(0),
  progress: integer('progress').notNull().default(0),
  cost: bigint('cost', { mode: 'number' }).notNull().default(0),
  position: integer('position').notNull().default(0),
});
export const osSiteLog = pgTable('os_site_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').notNull().references(() => osSite.id, { onDelete: 'cascade' }),
  at: ts('at').notNull().defaultNow(),
  weather: text('weather').notNull(),
  workforce: integer('workforce').notNull().default(0),
  text: text('text').notNull(),
  photo: jsonb('photo').$type<{ key: string; name: string }>(),
  by: text('by'),
});
export const osSiteStatement = pgTable('os_site_statement', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').notNull().references(() => osSite.id, { onDelete: 'cascade' }),
  no: integer('no').notNull(),
  at: ts('at').notNull().defaultNow(),
  progress: integer('progress').notNull(), // avancement cumulé (%)
  amount: bigint('amount', { mode: 'number' }).notNull(), // montant HT de la période
  invoiceNumber: text('invoice_number'),
});
export const osSiteSub = pgTable('os_site_sub', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').notNull().references(() => osSite.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  lot: text('lot').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  paid: bigint('paid', { mode: 'number' }).notNull().default(0),
});
export const osSiteHse = pgTable('os_site_hse', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: text('site_id').notNull().references(() => osSite.id, { onDelete: 'cascade' }),
  at: ts('at').notNull().defaultNow(),
  text: text('text').notNull(),
  status: text('status').notNull().default('Action en cours'), // Action en cours | Clôturé
});
export const osTender = pgTable('os_tender', {
  id: text('id').primaryKey(), // AO-26-031
  object: text('object').notNull(),
  client: text('client').notNull().default(''),
  country: text('country').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull().default(0),
  deadline: ts('deadline').notNull(),
  status: text('status').notNull().default('Veille'), // Veille | En étude | Go | No-go | Déposé | Gagné | Perdu
  probability: integer('probability').notNull().default(30),
  createdAt: ts('created_at').notNull().defaultNow(),
});
