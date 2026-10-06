CREATE TABLE "followup_request" (
	"cohort_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"months_after" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	CONSTRAINT "followup_request_cohort_id_user_id_months_after_pk" PRIMARY KEY("cohort_id","user_id","months_after")
);
--> statement-breakpoint
ALTER TABLE "followup_request" ADD CONSTRAINT "followup_request_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_request" ADD CONSTRAINT "followup_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;