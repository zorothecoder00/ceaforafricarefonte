ALTER TABLE "contact_message" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "escalated_at" timestamp with time zone;