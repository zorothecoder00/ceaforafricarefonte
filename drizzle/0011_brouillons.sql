CREATE TABLE "form_draft" (
	"user_id" text NOT NULL,
	"form_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_draft_user_id_form_id_pk" PRIMARY KEY("user_id","form_id")
);
--> statement-breakpoint
ALTER TABLE "form_draft" ADD CONSTRAINT "form_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;