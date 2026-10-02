CREATE TABLE "course_review" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_review_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "course_review" ADD CONSTRAINT "course_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_review_course_idx" ON "course_review" USING btree ("course_id");