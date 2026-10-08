CREATE TABLE "kapital"."data_room_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"investor_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapital"."vp_account" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"cash" bigint NOT NULL,
	"positions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pseudo" text NOT NULL,
	"final_rank" integer,
	"final_value" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vp_account_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "kapital"."vp_trade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"stock" text NOT NULL,
	"qty" integer NOT NULL,
	"price" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kapital"."dossier" ADD COLUMN "page" jsonb;--> statement-breakpoint
ALTER TABLE "kapital"."dossier" ADD COLUMN "access_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "kapital"."nda" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kapital"."nda" ADD COLUMN "expiry_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_question" ADD CONSTRAINT "data_room_question_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "kapital"."dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_question" ADD CONSTRAINT "data_room_question_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."data_room_question" ADD CONSTRAINT "data_room_question_answered_by_user_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."vp_account" ADD CONSTRAINT "vp_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapital"."vp_trade" ADD CONSTRAINT "vp_trade_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_room_question_dossier_idx" ON "kapital"."data_room_question" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "vp_account_month_idx" ON "kapital"."vp_account" USING btree ("month");--> statement-breakpoint
CREATE INDEX "vp_trade_user_idx" ON "kapital"."vp_trade" USING btree ("user_id","month");--> statement-breakpoint
-- Accords déjà signés : 90 jours d'accès à partir de la mise en service de l'expiration
UPDATE "kapital"."nda" SET "expires_at" = now() + interval '90 days' WHERE "revoked_at" IS NULL AND "expires_at" IS NULL;