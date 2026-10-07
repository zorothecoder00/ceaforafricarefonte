CREATE TABLE "os_budget" (
	"year" integer NOT NULL,
	"domain" text NOT NULL,
	"budget" bigint DEFAULT 0 NOT NULL,
	"engaged" bigint DEFAULT 0 NOT NULL,
	"realised" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_budget_year_domain_pk" PRIMARY KEY("year","domain")
);
--> statement-breakpoint
CREATE TABLE "os_delegation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_staff" text NOT NULL,
	"to_staff" text NOT NULL,
	"start" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_request" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"country" text NOT NULL,
	"domain" text,
	"by_staff" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cur" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'En approbation' NOT NULL,
	"hist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_timesheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"week" text NOT NULL,
	"domain" text NOT NULL,
	"project" text DEFAULT 'Activité courante' NOT NULL,
	"hours" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"poste" text NOT NULL,
	"poste2" text,
	"country" text NOT NULL,
	"domain" text,
	"manager_id" text,
	"grade" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"salary" bigint DEFAULT 0 NOT NULL,
	"leave_days" real DEFAULT 0 NOT NULL,
	"hire_date" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"onboarding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "os_delegation" ADD CONSTRAINT "os_delegation_from_staff_staff_id_fk" FOREIGN KEY ("from_staff") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_delegation" ADD CONSTRAINT "os_delegation_to_staff_staff_id_fk" FOREIGN KEY ("to_staff") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_request" ADD CONSTRAINT "os_request_by_staff_staff_id_fk" FOREIGN KEY ("by_staff") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_timesheet" ADD CONSTRAINT "os_timesheet_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_request_status_idx" ON "os_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "os_request_by_idx" ON "os_request" USING btree ("by_staff");--> statement-breakpoint
CREATE INDEX "os_timesheet_staff_idx" ON "os_timesheet" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_manager_idx" ON "staff" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "staff_country_idx" ON "staff" USING btree ("country");