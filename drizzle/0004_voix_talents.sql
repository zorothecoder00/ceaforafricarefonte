CREATE TABLE "barometer_response" (
	"quarter" text NOT NULL,
	"user_id" text NOT NULL,
	"country" text,
	"sector" text,
	"answers" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barometer_response_quarter_user_id_pk" PRIMARY KEY("quarter","user_id")
);
--> statement-breakpoint
CREATE TABLE "working_group_member" (
	"group" text NOT NULL,
	"user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "working_group_member_group_user_id_pk" PRIMARY KEY("group","user_id")
);
--> statement-breakpoint
ALTER TABLE "circle_session" ADD COLUMN "ratings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "cv_key" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "recruiter_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "response" text;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "barometer_response" ADD CONSTRAINT "barometer_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_group_member" ADD CONSTRAINT "working_group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;