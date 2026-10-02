CREATE TABLE "ag_ballot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly" text NOT NULL,
	"user_id" text NOT NULL,
	"choices" jsonb NOT NULL,
	"proof" text NOT NULL,
	"method" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ag_ballot_proof_unique" UNIQUE("proof")
);
--> statement-breakpoint
ALTER TABLE "ag_ballot" ADD CONSTRAINT "ag_ballot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ag_ballot_unique" ON "ag_ballot" USING btree ("assembly","user_id");