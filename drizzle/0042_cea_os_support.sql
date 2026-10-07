CREATE TABLE "os_doc_share" (
	"token" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"country" text,
	"confidentiality" text DEFAULT 'Interne' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"priority" text DEFAULT 'P3' NOT NULL,
	"category" text DEFAULT 'Informatique' NOT NULL,
	"status" text DEFAULT 'Ouvert' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"by_staff" text,
	"country" text,
	"domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_doc_share" ADD CONSTRAINT "os_doc_share_document_id_os_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."os_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_ticket" ADD CONSTRAINT "os_ticket_by_staff_staff_id_fk" FOREIGN KEY ("by_staff") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;