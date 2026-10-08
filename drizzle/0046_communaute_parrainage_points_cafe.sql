CREATE TABLE "coffee_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week" date NOT NULL,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"met_a" boolean,
	"met_b" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffee_optin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"paused" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_ambassador" (
	"user_id" text NOT NULL,
	"country" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"appointed_by" text,
	"ended_at" timestamp with time zone,
	CONSTRAINT "country_ambassador_user_id_country_pk" PRIMARY KEY("user_id","country")
);
--> statement-breakpoint
CREATE TABLE "referral" (
	"referee_id" text PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referral_code" (
	"user_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "coffee_match" ADD CONSTRAINT "coffee_match_user_a_user_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_match" ADD CONSTRAINT "coffee_match_user_b_user_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_optin" ADD CONSTRAINT "coffee_optin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_point" ADD CONSTRAINT "contribution_point_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_ambassador" ADD CONSTRAINT "country_ambassador_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_ambassador" ADD CONSTRAINT "country_ambassador_appointed_by_user_id_fk" FOREIGN KEY ("appointed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_referee_id_user_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_id_user_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_code" ADD CONSTRAINT "referral_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coffee_match_week_idx" ON "coffee_match" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_point_unique" ON "contribution_point" USING btree ("user_id","reason","ref");--> statement-breakpoint
CREATE INDEX "contribution_point_at_idx" ON "contribution_point" USING btree ("at");--> statement-breakpoint
CREATE INDEX "referral_referrer_idx" ON "referral" USING btree ("referrer_id");