ALTER TABLE "event_ticket" ADD COLUMN "holder_email" text;--> statement-breakpoint
ALTER TABLE "event_waitlist" ADD COLUMN "notified_at" timestamp with time zone;