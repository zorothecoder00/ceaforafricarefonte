CREATE TABLE "os_candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruit_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'Candidature spontanée' NOT NULL,
	"status" text DEFAULT 'Nouvelle' NOT NULL,
	"scores" jsonb,
	"evaluator" text,
	"cv" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_payroll" (
	"month" text PRIMARY KEY NOT NULL,
	"lines" jsonb NOT NULL,
	"by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_recruit" (
	"id" text PRIMARY KEY NOT NULL,
	"poste" text NOT NULL,
	"country" text NOT NULL,
	"by_staff" text,
	"status" text DEFAULT 'Demande' NOT NULL,
	"salary" bigint DEFAULT 0 NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_candidate" ADD CONSTRAINT "os_candidate_recruit_id_os_recruit_id_fk" FOREIGN KEY ("recruit_id") REFERENCES "public"."os_recruit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_recruit" ADD CONSTRAINT "os_recruit_by_staff_staff_id_fk" FOREIGN KEY ("by_staff") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;