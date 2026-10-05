CREATE TABLE "health_sample" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text NOT NULL,
	"base_ms" integer,
	"services" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "health_sample_at_idx" ON "health_sample" USING btree ("at");