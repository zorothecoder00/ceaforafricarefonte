ALTER TYPE "public"."consent_kind" ADD VALUE 'contacts_sponsors';--> statement-breakpoint
CREATE TABLE "event_alert" (
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_alert_event_id_kind_pk" PRIMARY KEY("event_id","kind")
);
--> statement-breakpoint
CREATE TABLE "event_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sponsor_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"sponsor_name" text NOT NULL,
	"user_id" text NOT NULL,
	"created_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_ticket" ADD COLUMN "sponsor_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_lead" ADD CONSTRAINT "event_lead_access_id_event_sponsor_access_id_fk" FOREIGN KEY ("access_id") REFERENCES "public"."event_sponsor_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_lead" ADD CONSTRAINT "event_lead_ticket_id_event_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."event_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_access" ADD CONSTRAINT "event_sponsor_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_access" ADD CONSTRAINT "event_sponsor_access_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_lead_unique" ON "event_lead" USING btree ("access_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsor_access_unique" ON "event_sponsor_access" USING btree ("event_id","user_id");