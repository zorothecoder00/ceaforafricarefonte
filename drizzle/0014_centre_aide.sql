CREATE TYPE "public"."ticket_priority" AS ENUM('basse', 'normale', 'haute', 'urgente');--> statement-breakpoint
CREATE TABLE "help_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article" text NOT NULL,
	"helpful" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_reply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"author_id" text,
	"from_staff" boolean NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "priority" "ticket_priority" DEFAULT 'normale' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "csat" integer;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "csat_comment" text;--> statement-breakpoint
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_message_id_contact_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."contact_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_feedback_article_idx" ON "help_feedback" USING btree ("article");--> statement-breakpoint
CREATE INDEX "ticket_reply_message_idx" ON "ticket_reply" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "contact_message" ADD CONSTRAINT "contact_message_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_message_user_idx" ON "contact_message" USING btree ("user_id");