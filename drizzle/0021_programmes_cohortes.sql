CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'excuse');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('brouillon', 'ouvert', 'clos', 'archive');--> statement-breakpoint
CREATE TYPE "public"."cohort_member_status" AS ENUM('actif', 'abandon', 'diplome');--> statement-breakpoint
CREATE TYPE "public"."cohort_status" AS ENUM('a_venir', 'en_cours', 'terminee');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('a_faire', 'declare', 'atteint', 'non_atteint');--> statement-breakpoint
CREATE TABLE "alumni_followup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"months_after" integer NOT NULL,
	"revenue_xof" bigint,
	"employees" integer,
	"funds_raised_xof" bigint,
	"still_active" boolean,
	"notes" text,
	"source" text DEFAULT 'equipe' NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "attendance_status" NOT NULL,
	"marked_by" text,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "call_jury" (
	"call_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"added_by" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_jury_call_id_user_id_pk" PRIMARY KEY("call_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"programme" text NOT NULL,
	"call_id" uuid,
	"starts_on" date,
	"ends_on" date,
	"status" "cohort_status" DEFAULT 'a_venir' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_member" (
	"cohort_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"application_id" uuid,
	"status" "cohort_member_status" DEFAULT 'actif' NOT NULL,
	"reason" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "cohort_member_cohort_id_user_id_pk" PRIMARY KEY("cohort_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "cohort_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'atelier' NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 120 NOT NULL,
	"place" text
);
--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"jury_id" text NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total" integer,
	"comment" text,
	"conflict" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_on" date,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_progress" (
	"milestone_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "milestone_status" DEFAULT 'a_faire' NOT NULL,
	"evidence" text,
	"validated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestone_progress_milestone_id_user_id_pk" PRIMARY KEY("milestone_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "programme_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"programme" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"status" "call_status" DEFAULT 'brouillon' NOT NULL,
	"grid" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviews_per_app" integer DEFAULT 2 NOT NULL,
	"role" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_call_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "selection_committee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"members" text NOT NULL,
	"minutes" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alumni_followup" ADD CONSTRAINT "alumni_followup_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni_followup" ADD CONSTRAINT "alumni_followup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni_followup" ADD CONSTRAINT "alumni_followup_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_cohort_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cohort_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jury" ADD CONSTRAINT "call_jury_call_id_programme_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."programme_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jury" ADD CONSTRAINT "call_jury_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jury" ADD CONSTRAINT "call_jury_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_call_id_programme_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."programme_call"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_application_id_programme_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."programme_application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_session" ADD CONSTRAINT "cohort_session_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_application_id_programme_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."programme_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_jury_id_user_id_fk" FOREIGN KEY ("jury_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_progress" ADD CONSTRAINT "milestone_progress_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_progress" ADD CONSTRAINT "milestone_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_progress" ADD CONSTRAINT "milestone_progress_validated_by_user_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_call" ADD CONSTRAINT "programme_call_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_committee" ADD CONSTRAINT "selection_committee_call_id_programme_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."programme_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_committee" ADD CONSTRAINT "selection_committee_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alumni_followup_unique" ON "alumni_followup" USING btree ("cohort_id","user_id","months_after");--> statement-breakpoint
CREATE INDEX "cohort_session_cohort_idx" ON "cohort_session" USING btree ("cohort_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_unique" ON "evaluation" USING btree ("application_id","jury_id");