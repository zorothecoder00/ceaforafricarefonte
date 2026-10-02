ALTER TABLE "job" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "study_level" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "tutor" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "school" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "degree" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "study_level" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "available_from" date;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "available_until" date;