CREATE TABLE "role_right" (
	"role" text NOT NULL,
	"obj" text NOT NULL,
	"rights" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_right_role_obj_pk" PRIMARY KEY("role","obj")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "officer_id" text;--> statement-breakpoint
ALTER TABLE "role_right" ADD CONSTRAINT "role_right_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_suspended_by_user_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_officer_id_user_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;