CREATE TABLE "web_vital" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"metric" text NOT NULL,
	"value" real NOT NULL,
	"mobile" boolean NOT NULL,
	"lite" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "web_vital_at_idx" ON "web_vital" USING btree ("at");