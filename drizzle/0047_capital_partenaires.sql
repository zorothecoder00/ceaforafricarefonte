CREATE TABLE "cap_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"company" text NOT NULL,
	"model" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_access" (
	"user_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_access_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "partner_deliverable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'a_faire' NOT NULL,
	"note" text,
	"link" text,
	"delivered_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cap_table" ADD CONSTRAINT "cap_table_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_access" ADD CONSTRAINT "partner_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_access" ADD CONSTRAINT "partner_access_org_id_crm_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."crm_org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_access" ADD CONSTRAINT "partner_access_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_deliverable" ADD CONSTRAINT "partner_deliverable_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_deliverable" ADD CONSTRAINT "partner_deliverable_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cap_table_owner_idx" ON "cap_table" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "partner_deliverable_deal_idx" ON "partner_deliverable" USING btree ("deal_id");