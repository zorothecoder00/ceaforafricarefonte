CREATE TABLE "domain" (
	"id" text PRIMARY KEY NOT NULL,
	"icon" text DEFAULT 'info' NOT NULL,
	"name" text NOT NULL,
	"dom" text NOT NULL,
	"summary" text NOT NULL,
	"highlight" text DEFAULT '' NOT NULL,
	"link" text,
	"audience" text DEFAULT '' NOT NULL,
	"method" text[] DEFAULT '{}' NOT NULL,
	"deliverables" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;