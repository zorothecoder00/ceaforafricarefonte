CREATE TABLE "os_inscription" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"country" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'Site web' NOT NULL,
	"status" text DEFAULT 'En attente' NOT NULL,
	"reason" text,
	"message_id" uuid,
	"user_id" text,
	"sla_from" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_report" (
	"country" text NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'Brouillon' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "os_report_country_period_pk" PRIMARY KEY("country","period")
);
--> statement-breakpoint
CREATE INDEX "os_inscription_status_idx" ON "os_inscription" USING btree ("status");