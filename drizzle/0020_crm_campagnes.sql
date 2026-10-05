CREATE TYPE "public"."campaign_channel" AS ENUM('email', 'sms', 'whatsapp', 'push');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('brouillon', 'programmee', 'envoi', 'envoyee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."crm_deal_stage" AS ENUM('prospect', 'contact', 'proposition', 'negociation', 'gagne', 'perdu');--> statement-breakpoint
CREATE TYPE "public"."crm_org_kind" AS ENUM('entreprise', 'bailleur', 'banque', 'fondation', 'institution', 'media', 'universite', 'association', 'autre');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"purpose" text DEFAULT 'marketing' NOT NULL,
	"segment_id" uuid,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"subject_b" text,
	"body_b" text,
	"split_b" integer DEFAULT 0 NOT NULL,
	"status" "campaign_status" DEFAULT 'brouillon' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_by" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_send" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"recipient_key" text NOT NULL,
	"address" text,
	"name" text,
	"variant" text DEFAULT 'A' NOT NULL,
	"status" text DEFAULT 'en_attente' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"org_id" uuid,
	"role" text,
	"country" text,
	"sector" text,
	"lang" text DEFAULT 'fr' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"consent_basis" text,
	"consent_at" timestamp with time zone,
	"notes" text,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'partenariat' NOT NULL,
	"stage" "crm_deal_stage" DEFAULT 'prospect' NOT NULL,
	"amount_xof" bigint,
	"event_id" text,
	"expected_on" date,
	"owner_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"contact_id" uuid,
	"org_id" uuid,
	"deal_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" text
);
--> statement-breakpoint
CREATE TABLE "crm_org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "crm_org_kind" DEFAULT 'entreprise' NOT NULL,
	"country" text,
	"sector" text,
	"website" text,
	"notes" text,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_segment_id_crm_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."crm_segment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_send" ADD CONSTRAINT "campaign_send_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_template" ADD CONSTRAINT "campaign_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_org_id_crm_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."crm_org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_org_id_crm_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."crm_org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_contact_id_crm_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_org_id_crm_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."crm_org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interaction" ADD CONSTRAINT "crm_interaction_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_org" ADD CONSTRAINT "crm_org_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_segment" ADD CONSTRAINT "crm_segment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_send_unique" ON "campaign_send" USING btree ("campaign_id","recipient_key");--> statement-breakpoint
CREATE INDEX "campaign_send_status_idx" ON "campaign_send" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contact_email_unique" ON "crm_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "crm_contact_org_idx" ON "crm_contact" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_deal_stage_idx" ON "crm_deal" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_interaction_user_idx" ON "crm_interaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_interaction_contact_idx" ON "crm_interaction" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_interaction_org_idx" ON "crm_interaction" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_org_name_idx" ON "crm_org" USING btree ("name");