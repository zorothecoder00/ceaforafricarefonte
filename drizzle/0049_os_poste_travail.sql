CREATE TABLE "os_agenda_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_doc_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"body" text NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_doc_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text,
	"body" text,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"sha256" text,
	"note" text DEFAULT '' NOT NULL,
	"by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_mission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'permanente' NOT NULL,
	"recurrence" text,
	"estimate" real DEFAULT 1 NOT NULL,
	"domain" text,
	"start" timestamp with time zone DEFAULT now() NOT NULL,
	"end" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"last_run" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"period" text NOT NULL,
	"period_key" text NOT NULL,
	"title" text NOT NULL,
	"target" real DEFAULT 100 NOT NULL,
	"current" real DEFAULT 0 NOT NULL,
	"unit" text DEFAULT '%' NOT NULL,
	"okr_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_sign_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sha256" text NOT NULL,
	"signers" jsonb NOT NULL,
	"cur" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'En cours' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "os_signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"signer" text NOT NULL,
	"name" text NOT NULL,
	"poste" text DEFAULT '' NOT NULL,
	"sha256" text NOT NULL,
	"statement" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_skill" (
	"staff_id" text NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"target" integer DEFAULT 3 NOT NULL,
	"certification" text,
	"cert_expires" timestamp with time zone,
	"plan" text,
	"plan_due" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_skill_staff_id_name_pk" PRIMARY KEY("staff_id","name")
);
--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "status" text DEFAULT 'Brouillon' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "kind" text DEFAULT 'fichier' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "source_request" text;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "validation_request" text;--> statement-breakpoint
ALTER TABLE "os_document" ADD COLUMN "final_version" integer;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "priority" text DEFAULT 'normale' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "estimate" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "delegated_by" text;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_task" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_agenda_item" ADD CONSTRAINT "os_agenda_item_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_doc_version" ADD CONSTRAINT "os_doc_version_document_id_os_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."os_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_mission" ADD CONSTRAINT "os_mission_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_objective" ADD CONSTRAINT "os_objective_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_sign_flow" ADD CONSTRAINT "os_sign_flow_document_id_os_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."os_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_signature" ADD CONSTRAINT "os_signature_flow_id_os_sign_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."os_sign_flow"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_skill" ADD CONSTRAINT "os_skill_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_agenda_item_staff_idx" ON "os_agenda_item" USING btree ("staff_id","start");--> statement-breakpoint
CREATE UNIQUE INDEX "os_doc_version_unique" ON "os_doc_version" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "os_mission_staff_idx" ON "os_mission" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "os_objective_staff_idx" ON "os_objective" USING btree ("staff_id","period_key");--> statement-breakpoint
-- Documents déjà déposés : statut « Déposé » (fichier versé sans circuit de validation) et version courante reprise dans l'historique
UPDATE "os_document" SET "status" = 'Déposé', "owner" = "by";
--> statement-breakpoint
INSERT INTO "os_doc_version" ("document_id", "version", "storage_key", "mime", "size", "note", "by", "created_at")
SELECT "id", "version", "storage_key", "mime", "size", 'Version reprise à la mise en service de l''historique', "by", "updated_at" FROM "os_document";
--> statement-breakpoint
-- Tâches déjà terminées : date de fin connue au mieux
UPDATE "os_task" SET "done_at" = "created_at" WHERE "status" = 'Terminé' AND "done_at" IS NULL;
--> statement-breakpoint
-- Signatures immuables (certificat conservé avec le document)
CREATE OR REPLACE FUNCTION os_signature_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Une signature enregistrée ne peut être ni modifiée ni supprimée.';
END $$;
--> statement-breakpoint
CREATE TRIGGER os_signature_immuable BEFORE UPDATE OR DELETE ON "os_signature" FOR EACH ROW EXECUTE FUNCTION os_signature_immuable();
