CREATE TABLE "os_closing" (
	"period" text PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "os_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"party" text NOT NULL,
	"type" text NOT NULL,
	"domain" text,
	"country" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"start" timestamp with time zone DEFAULT now() NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'En signature' NOT NULL,
	"owner" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "os_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"journal" text NOT NULL,
	"label" text NOT NULL,
	"lines" jsonb NOT NULL,
	"country" text,
	"domain" text,
	"ref" text DEFAULT '' NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "os_po" (
	"id" text PRIMARY KEY NOT NULL,
	"by_staff" text,
	"supplier_id" text,
	"label" text NOT NULL,
	"item_code" text,
	"qty" integer DEFAULT 0 NOT NULL,
	"amount" bigint NOT NULL,
	"country" text NOT NULL,
	"domain" text,
	"status" text DEFAULT 'Commandé' NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"amount" bigint NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'Non rapproché' NOT NULL,
	"invoice_id" uuid,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "os_stock_item" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"min" integer DEFAULT 0 NOT NULL,
	"country" text NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_stock_move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"country" text NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'À vérifier' NOT NULL,
	"created_by" text,
	"verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_treasury" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "os_po" ADD CONSTRAINT "os_po_supplier_id_os_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."os_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_stock_move" ADD CONSTRAINT "os_stock_move_code_os_stock_item_code_fk" FOREIGN KEY ("code") REFERENCES "public"."os_stock_item"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_ledger_at_idx" ON "os_ledger" USING btree ("at");--> statement-breakpoint
CREATE INDEX "os_ledger_ref_idx" ON "os_ledger" USING btree ("ref");