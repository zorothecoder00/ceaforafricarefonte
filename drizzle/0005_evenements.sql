CREATE TYPE "public"."b2b_meeting_status" AS ENUM('demandee', 'acceptee', 'refusee', 'annulee');--> statement-breakpoint
CREATE TABLE "b2b_meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"target_id" text NOT NULL,
	"slot" text NOT NULL,
	"note" text,
	"status" "b2b_meeting_status" DEFAULT 'demandee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "b2b_profile" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"offer" text NOT NULL,
	"need" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_profile_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_agenda" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"session" text NOT NULL,
	CONSTRAINT "event_agenda_user_id_event_id_session_pk" PRIMARY KEY("user_id","event_id","session")
);
--> statement-breakpoint
CREATE TABLE "event_feedback" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"nps" integer,
	"comment" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_feedback_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "b2b_meeting" ADD CONSTRAINT "b2b_meeting_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_meeting" ADD CONSTRAINT "b2b_meeting_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_profile" ADD CONSTRAINT "b2b_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_agenda" ADD CONSTRAINT "event_agenda_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "b2b_meeting_event_idx" ON "b2b_meeting" USING btree ("event_id");