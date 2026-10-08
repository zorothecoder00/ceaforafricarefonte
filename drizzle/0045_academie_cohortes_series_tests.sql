CREATE TABLE "academy_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reviews_required" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"seats" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_cohort_member" (
	"cohort_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_cohort_member_cohort_id_user_id_pk" PRIMARY KEY("cohort_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "academy_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"score" integer,
	"comment" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "academy_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"minutes" integer DEFAULT 60 NOT NULL,
	"link" text,
	"replay" text
);
--> statement-breakpoint
CREATE TABLE "academy_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_day" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"actions" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learning_day_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "skill_test_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"test_id" text NOT NULL,
	"questions" integer[] NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"score" integer,
	"passed" boolean
);
--> statement-breakpoint
ALTER TABLE "academy_assignment" ADD CONSTRAINT "academy_assignment_cohort_id_academy_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."academy_cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_cohort" ADD CONSTRAINT "academy_cohort_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_cohort_member" ADD CONSTRAINT "academy_cohort_member_cohort_id_academy_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."academy_cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_cohort_member" ADD CONSTRAINT "academy_cohort_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_review" ADD CONSTRAINT "academy_review_submission_id_academy_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."academy_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_review" ADD CONSTRAINT "academy_review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session" ADD CONSTRAINT "academy_session_cohort_id_academy_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."academy_cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_submission" ADD CONSTRAINT "academy_submission_assignment_id_academy_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."academy_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_submission" ADD CONSTRAINT "academy_submission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_day" ADD CONSTRAINT "learning_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_test_attempt" ADD CONSTRAINT "skill_test_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_cohort_course_idx" ON "academy_cohort" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_review_unique" ON "academy_review" USING btree ("submission_id","reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_submission_unique" ON "academy_submission" USING btree ("assignment_id","user_id");--> statement-breakpoint
CREATE INDEX "skill_test_attempt_user_idx" ON "skill_test_attempt" USING btree ("user_id","test_id");