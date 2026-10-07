CREATE TABLE "os_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'Planifié' NOT NULL,
	"findings" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_country" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "os_flow_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "os_interview" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"manager_id" text,
	"competences" jsonb NOT NULL,
	"objectives" text DEFAULT '' NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_okr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" uuid,
	"owner" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_review" (
	"quarter" text PRIMARY KEY NOT NULL,
	"start" timestamp with time zone DEFAULT now() NOT NULL,
	"applied" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_review_item" (
	"quarter" text NOT NULL,
	"staff_id" text NOT NULL,
	"decision" text NOT NULL,
	"by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_review_item_quarter_staff_id_pk" PRIMARY KEY("quarter","staff_id")
);
--> statement-breakpoint
CREATE TABLE "os_risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"probability" integer NOT NULL,
	"impact" integer NOT NULL,
	"owner" text,
	"plan" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Ouvert' NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_interview" ADD CONSTRAINT "os_interview_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_interview" ADD CONSTRAINT "os_interview_manager_id_staff_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_okr" ADD CONSTRAINT "os_okr_owner_staff_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_review_item" ADD CONSTRAINT "os_review_item_quarter_os_review_quarter_fk" FOREIGN KEY ("quarter") REFERENCES "public"."os_review"("quarter") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_review_item" ADD CONSTRAINT "os_review_item_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_review_item" ADD CONSTRAINT "os_review_item_by_staff_id_fk" FOREIGN KEY ("by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_risk" ADD CONSTRAINT "os_risk_owner_staff_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;