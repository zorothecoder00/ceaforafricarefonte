CREATE TYPE "public"."form_status" AS ENUM('brouillon', 'publie', 'clos');--> statement-breakpoint
CREATE TABLE "automation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"secret" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"event" text NOT NULL,
	"subject" text,
	"ok" boolean NOT NULL,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"readers" text[] DEFAULT '{}' NOT NULL,
	"writers" text[] DEFAULT '{}' NOT NULL,
	"watermark" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"user_id" text,
	"share_id" uuid,
	"action" text NOT NULL,
	"detail" text,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"token" text NOT NULL,
	"recipient" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_downloads" integer,
	"downloads" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_share_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "doc_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"note" text,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_def" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"routing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_team" text DEFAULT 'Accueil' NOT NULL,
	"delay" text DEFAULT '2 jours ouvrés' NOT NULL,
	"ack" text DEFAULT 'Merci, votre demande est bien reçue.' NOT NULL,
	"require_login" boolean DEFAULT false NOT NULL,
	"status" "form_status" DEFAULT 'brouillon' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_def_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "form_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"ticket_ref" text NOT NULL,
	"user_id" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_automation_id_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_file" ADD CONSTRAINT "doc_file_folder_id_doc_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folder"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_file" ADD CONSTRAINT "doc_file_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folder" ADD CONSTRAINT "doc_folder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_log" ADD CONSTRAINT "doc_log_file_id_doc_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."doc_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_log" ADD CONSTRAINT "doc_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_share" ADD CONSTRAINT "doc_share_file_id_doc_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."doc_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_share" ADD CONSTRAINT "doc_share_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_version" ADD CONSTRAINT "doc_version_file_id_doc_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."doc_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_version" ADD CONSTRAINT "doc_version_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_def" ADD CONSTRAINT "form_def_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_id_form_def_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_def"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_run_idx" ON "automation_run" USING btree ("automation_id","at");--> statement-breakpoint
CREATE INDEX "doc_file_folder_idx" ON "doc_file" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "doc_log_file_idx" ON "doc_log" USING btree ("file_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_version_unique" ON "doc_version" USING btree ("file_id","version");--> statement-breakpoint
CREATE INDEX "form_submission_form_idx" ON "form_submission" USING btree ("form_id","created_at");