CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"team" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"contact" text NOT NULL,
	"topic" text,
	"visio" text NOT NULL,
	"user_id" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_at_idx" ON "appointment" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_slot_unique" ON "appointment" USING btree ("team","at") WHERE "appointment"."cancelled_at" is null;