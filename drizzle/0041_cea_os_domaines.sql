CREATE TABLE "os_capital" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"stage" text DEFAULT 'Sensibilisation' NOT NULL,
	"valuation" bigint DEFAULT 0 NOT NULL,
	"share" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_event_fin" (
	"event_id" text PRIMARY KEY NOT NULL,
	"budget" bigint DEFAULT 0 NOT NULL,
	"sponsors" integer DEFAULT 0 NOT NULL,
	"sponsorship" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"domain" text DEFAULT 'prj' NOT NULL,
	"funder" text DEFAULT '' NOT NULL,
	"budget" bigint DEFAULT 0 NOT NULL,
	"spent" bigint DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"health" text DEFAULT 'ok' NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next" timestamp with time zone,
	"owner" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_site" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"amount" bigint NOT NULL,
	"start" timestamp with time zone DEFAULT now() NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"manager" text,
	"retention" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_site_hse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'Action en cours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_site_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"weather" text NOT NULL,
	"workforce" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"photo" jsonb,
	"by" text
);
--> statement-breakpoint
CREATE TABLE "os_site_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"budget" bigint DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_site_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"no" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"progress" integer NOT NULL,
	"amount" bigint NOT NULL,
	"invoice_number" text
);
--> statement-breakpoint
CREATE TABLE "os_site_sub" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"lot" text NOT NULL,
	"amount" bigint NOT NULL,
	"paid" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_tender" (
	"id" text PRIMARY KEY NOT NULL,
	"object" text NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"country" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'Veille' NOT NULL,
	"probability" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_site_hse" ADD CONSTRAINT "os_site_hse_site_id_os_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."os_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_site_log" ADD CONSTRAINT "os_site_log_site_id_os_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."os_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_site_lot" ADD CONSTRAINT "os_site_lot_site_id_os_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."os_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_site_statement" ADD CONSTRAINT "os_site_statement_site_id_os_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."os_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_site_sub" ADD CONSTRAINT "os_site_sub_site_id_os_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."os_site"("id") ON DELETE cascade ON UPDATE no action;