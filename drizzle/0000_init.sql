CREATE SCHEMA "kapital";
--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('brouillon', 'recue', 'en_evaluation', 'entretien', 'admise', 'liste_attente', 'refusee', 'retiree');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('compte', 'profil_public', 'marketing', 'partage_investisseurs', 'cookies_mesure');--> statement-breakpoint
CREATE TYPE "public"."job_application_status" AS ENUM('envoyee', 'vue', 'entretien', 'offre', 'refus', 'retiree');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('brouillon', 'en_moderation', 'publiee', 'fermee', 'refusee');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('CDI', 'CDD', 'Stage', 'Alternance', 'Freelance', 'Mission');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'expiree', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."mentoring_status" AS ENUM('demandee', 'confirmee', 'realisee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('adhesion', 'billet', 'cours', 'programme', 'mastermind', 'expert', 'mise_en_avant', 'recherche', 'sponsoring');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('en_attente', 'reussi', 'echoue', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('gratuit', 'membre', 'premium', 'entreprise');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('deposee', 'en_discussion', 'adoptee', 'rejetee');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('membre', 'entrepreneur', 'talent', 'employeur', 'mentor', 'investisseur', 'souscripteur', 'partenaire', 'charge_programme', 'analyste', 'comite', 'conformite', 'editeur', 'responsable_pays', 'admin', 'direction');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('nouveau', 'en_cours', 'traite', 'clos');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valide', 'utilise', 'rembourse', 'transfere', 'annule');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'membres', 'prive');--> statement-breakpoint
CREATE TYPE "kapital"."committee_decision_kind" AS ENUM('favorable', 'defavorable', 'ajourne');--> statement-breakpoint
CREATE TYPE "kapital"."data_room_folder" AS ENUM('juridique', 'financier', 'commercial', 'technique', 'rh', 'fiscal', 'esg');--> statement-breakpoint
CREATE TYPE "kapital"."dossier_status" AS ENUM('recu', 'incomplet', 'preselectionne', 'diagnostic', 'en_preparation', 'revue_analyste', 'comite', 'pret_presentation', 'mis_en_relation', 'finance', 'cloture');--> statement-breakpoint
CREATE TYPE "kapital"."instrument" AS ENUM('actions_ordinaires', 'actions_preference', 'safe_bsa_air', 'obligations_convertibles', 'dette_privee', 'mezzanine', 'financement_islamique', 'subvention');--> statement-breakpoint
CREATE TYPE "kapital"."investor_category" AS ENUM('particulier', 'averti', 'professionnel');--> statement-breakpoint
CREATE TYPE "kapital"."kyc_check_kind" AS ENUM('identite', 'vivacite', 'sanctions', 'pep', 'origine_fonds', 'kyb_immatriculation', 'kyb_beneficiaires');--> statement-breakpoint
CREATE TYPE "kapital"."kyc_status" AS ENUM('non_commence', 'en_cours', 'verifie', 'refuse', 'expire');--> statement-breakpoint
CREATE TYPE "kapital"."verification_level" AS ENUM('declaratif', 'diligence_en_cours', 'verifie');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"title" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificate_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "consultation_vote" (
	"consultation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_vote_consultation_id_user_id_pk" PRIMARY KEY("consultation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contact_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"motif" text NOT NULL,
	"routed_team" text NOT NULL,
	"country" text,
	"name" text NOT NULL,
	"contact" text NOT NULL,
	"message" text NOT NULL,
	"user_id" text,
	"status" "request_status" DEFAULT 'nouveau' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_message_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"completed_lessons" integer[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "enrollment_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "event_ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"event_id" text NOT NULL,
	"ticket_type" text NOT NULL,
	"price_xof" bigint DEFAULT 0 NOT NULL,
	"user_id" text,
	"holder_name" text,
	"status" "ticket_status" DEFAULT 'valide' NOT NULL,
	"payment_id" uuid,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_ticket_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "hire_declaration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" text NOT NULL,
	"person_name" text NOT NULL,
	"contract" "job_type" NOT NULL,
	"hired_on" date NOT NULL,
	"country" text,
	"verified_6m_at" timestamp with time zone,
	"verified_12m_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" text,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"country" text NOT NULL,
	"type" "job_type" NOT NULL,
	"remote" boolean DEFAULT false NOT NULL,
	"diaspora" boolean DEFAULT false NOT NULL,
	"salary" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"status" "job_status" DEFAULT 'en_moderation' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "job_application_status" DEFAULT 'envoyee' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"card_number" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"payment_id" uuid,
	CONSTRAINT "membership_card_number_unique" UNIQUE("card_number")
);
--> statement-breakpoint
CREATE TABLE "mentoring_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_id" text NOT NULL,
	"mentee_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "mentoring_status" DEFAULT 'demandee' NOT NULL,
	"mentee_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"country" text,
	"lang" text DEFAULT 'fr' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscription_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" text,
	"purpose" "payment_purpose" NOT NULL,
	"amount_xof" bigint NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"provider" text,
	"method" text,
	"provider_ref" text,
	"status" "payment_status" DEFAULT 'en_attente' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payment_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"headline" text,
	"bio" text,
	"country" text,
	"city" text,
	"lang" text DEFAULT 'fr' NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"sector" text,
	"company_name" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"needs" text,
	"offers" text,
	"visibility" "visibility" DEFAULT 'membres' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programme_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" text NOT NULL,
	"programme" text NOT NULL,
	"status" "application_status" DEFAULT 'recue' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_application_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"country" text,
	"theme" text,
	"status" "proposal_status" DEFAULT 'deposee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_support" (
	"proposal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_support_proposal_id_user_id_pk" PRIMARY KEY("proposal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"url" text,
	"description" text NOT NULL,
	"contact" text,
	"anonymous" boolean DEFAULT true NOT NULL,
	"status" "request_status" DEFAULT 'nouveau' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	"country" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text,
	CONSTRAINT "user_role_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "kapital"."committee_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"meeting_on" timestamp with time zone NOT NULL,
	"decision" "kapital"."committee_decision_kind" NOT NULL,
	"minutes" text,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."data_room_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"folder" "kapital"."data_room_folder" NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."data_room_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"investor_id" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."diagnostic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"dossier_id" uuid,
	"answers" integer[] NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."dossier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"owner_id" text NOT NULL,
	"analyst_id" text,
	"company_name" text NOT NULL,
	"country" text NOT NULL,
	"rccm" text,
	"sector" text,
	"stage" text,
	"amount_xof" bigint,
	"instrument" "kapital"."instrument",
	"use_of_funds" text,
	"traction" text,
	"team" text,
	"status" "kapital"."dossier_status" DEFAULT 'recu' NOT NULL,
	"verification" "kapital"."verification_level" DEFAULT 'declaratif' NOT NULL,
	"investor_ready_score" integer,
	"share_consent" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dossier_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "kapital"."dossier_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"from_status" "kapital"."dossier_status",
	"to_status" "kapital"."dossier_status" NOT NULL,
	"actor_id" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."feature_flag" (
	"country" text NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"legal_note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_country_feature_pk" PRIMARY KEY("country","feature")
);
--> statement-breakpoint
CREATE TABLE "kapital"."interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"investor_id" text NOT NULL,
	"amount_xof" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."investor_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"category" "kapital"."investor_category",
	"sectors" text[] DEFAULT '{}' NOT NULL,
	"countries" text[] DEFAULT '{}' NOT NULL,
	"ticket_min_xof" bigint,
	"ticket_max_xof" bigint,
	"kyc_status" "kapital"."kyc_status" DEFAULT 'non_commence' NOT NULL,
	"verified_at" timestamp with time zone,
	"next_review_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kapital"."kyc_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"dossier_id" uuid,
	"kind" "kapital"."kyc_check_kind" NOT NULL,
	"status" "kapital"."kyc_status" DEFAULT 'en_cours' NOT NULL,
	"provider" text,
	"provider_ref" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."nda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"investor_id" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature_ref" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kapital"."watchlist" (
	"user_id" text NOT NULL,
	"item" text NOT NULL,
	"alert_pct" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_item_pk" PRIMARY KEY("user_id","item")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_vote" ADD CONSTRAINT "consultation_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_message" ADD CONSTRAINT "contact_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ticket" ADD CONSTRAINT "event_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ticket" ADD CONSTRAINT "event_ticket_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hire_declaration" ADD CONSTRAINT "hire_declaration_employer_id_user_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_employer_id_user_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_session" ADD CONSTRAINT "mentoring_session_mentor_id_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_session" ADD CONSTRAINT "mentoring_session_mentee_id_user_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_application" ADD CONSTRAINT "programme_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_support" ADD CONSTRAINT "proposal_support_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_support" ADD CONSTRAINT "proposal_support_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."committee_decision" ADD CONSTRAINT "committee_decision_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_document" ADD CONSTRAINT "data_room_document_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_document" ADD CONSTRAINT "data_room_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_view" ADD CONSTRAINT "data_room_view_document_id_data_room_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "kapital"."data_room_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_view" ADD CONSTRAINT "data_room_view_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."diagnostic" ADD CONSTRAINT "diagnostic_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."diagnostic" ADD CONSTRAINT "diagnostic_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."dossier" ADD CONSTRAINT "dossier_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."dossier" ADD CONSTRAINT "dossier_analyst_id_user_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."dossier_event" ADD CONSTRAINT "dossier_event_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."dossier_event" ADD CONSTRAINT "dossier_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."feature_flag" ADD CONSTRAINT "feature_flag_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."interest" ADD CONSTRAINT "interest_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."interest" ADD CONSTRAINT "interest_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."investor_profile" ADD CONSTRAINT "investor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."kyc_check" ADD CONSTRAINT "kyc_check_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."kyc_check" ADD CONSTRAINT "kyc_check_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."nda" ADD CONSTRAINT "nda_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."nda" ADD CONSTRAINT "nda_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."watchlist" ADD CONSTRAINT "watchlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "consent_user_kind_idx" ON "consent" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "event_ticket_event_idx" ON "event_ticket" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "job_status_country_idx" ON "job" USING btree ("status","country");--> statement-breakpoint
CREATE UNIQUE INDEX "job_application_unique" ON "job_application" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "programme_application_user_idx" ON "programme_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "programme_application_prog_idx" ON "programme_application" USING btree ("programme","status");--> statement-breakpoint
CREATE INDEX "data_room_view_doc_idx" ON "kapital"."data_room_view" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "dossier_status_idx" ON "kapital"."dossier" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dossier_owner_idx" ON "kapital"."dossier" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dossier_event_dossier_idx" ON "kapital"."dossier_event" USING btree ("dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_unique" ON "kapital"."interest" USING btree ("dossier_id","investor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nda_unique" ON "kapital"."nda" USING btree ("dossier_id","investor_id");