CREATE TABLE "os_organ_member" (
	"organ" text NOT NULL,
	"staff_id" text NOT NULL,
	"role" text DEFAULT 'Membre' NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_organ_member_organ_staff_id_pk" PRIMARY KEY("organ","staff_id")
);
--> statement-breakpoint
CREATE TABLE "os_wf_circuit" (
	"code" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb NOT NULL,
	"escalade" text DEFAULT '' NOT NULL,
	"origin" text DEFAULT 'referentiel' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_wf_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"version" integer NOT NULL,
	"step" integer,
	"level" text,
	"threshold" text,
	"decision" text NOT NULL,
	"by_staff" text,
	"by_name" text NOT NULL,
	"delegant" text,
	"motif" text,
	"proof" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_wf_threshold" (
	"type" text NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"amount" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_wf_threshold_type_scope_key_pk" PRIMARY KEY("type","scope","key")
);
--> statement-breakpoint
CREATE TABLE "os_wf_type" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"circuit" text NOT NULL,
	"prefix" text NOT NULL,
	"phases" jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reject_to" text DEFAULT 'clos' NOT NULL,
	"exec" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sla" integer DEFAULT 48 NOT NULL,
	"due_days" integer DEFAULT 30 NOT NULL,
	"generic" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_delegation" ADD COLUMN "scope" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "os_delegation" ADD COLUMN "authorized_by" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "circuit" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "phase" text DEFAULT 'validation' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "due" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "proof" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "countries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "conf" text DEFAULT 'Interne' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "risk" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "strategic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "pieces" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "step_due" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "os_request" ADD COLUMN "reminded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "os_organ_member" ADD CONSTRAINT "os_organ_member_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_wf_decision" ADD CONSTRAINT "os_wf_decision_request_id_os_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."os_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_wf_decision_req_idx" ON "os_wf_decision" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "os_request" ADD CONSTRAINT "os_request_owner_staff_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_request_owner_idx" ON "os_request" USING btree ("owner");--> statement-breakpoint
-- Dossiers existants : responsable = demandeur, portée = pays du dossier, circuit d'origine, phase selon l'état
UPDATE "os_request" SET "owner" = "by_staff", "countries" = jsonb_build_array("country"),
  "circuit" = CASE "type" WHEN 'dep' THEN 'V04' WHEN 'ndf' THEN 'V04-NDF' WHEN 'achat' THEN 'V04-ACH' WHEN 'conge' THEN 'V01-CONGE' WHEN 'contrat' THEN 'V05' WHEN 'recrut' THEN 'V06' WHEN 'offre' THEN 'V06-OFFRE' END,
  "phase" = CASE WHEN "status" = 'En approbation' THEN 'validation' WHEN "status" = 'Rejetée' THEN 'cloture' ELSE 'execution' END,
  "next_action" = CASE WHEN "status" = 'En approbation' THEN 'Validation en cours' ELSE NULL END;
--> statement-breakpoint
-- Journal des décisions : reprise de l'historique (soumission, puis décisions déjà prises)
INSERT INTO "os_wf_decision" ("request_id", "version", "step", "level", "decision", "by_staff", "by_name", "motif", "at")
SELECT r."id", 1, NULL, NULL, 'soumis', r."by_staff", coalesce(s."name", r."by_staff"), NULL, r."created_at" FROM "os_request" r LEFT JOIN "staff" s ON s."id" = r."by_staff";
--> statement-breakpoint
INSERT INTO "os_wf_decision" ("request_id", "version", "step", "level", "decision", "by_staff", "by_name", "motif", "at")
SELECT r."id", 1, (e.i - 1)::int, e.v->>'l', CASE e.v->>'st' WHEN 'ok' THEN 'approuve' ELSE 'rejete' END, e.v->>'whoId', coalesce(e.v->>'who', '—'), nullif(e.v->>'com', ''), coalesce((e.v->>'at')::timestamptz, r."updated_at")
FROM "os_request" r, jsonb_array_elements(r."steps") WITH ORDINALITY AS e(v, i) WHERE e.v->>'st' IN ('ok', 'rejet');
--> statement-breakpoint
-- Journal immuable (CEA Audit) : aucune modification ni suppression d'une décision enregistrée
CREATE OR REPLACE FUNCTION os_wf_decision_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Le journal des décisions est immuable : modification ou suppression refusée.';
END $$;
--> statement-breakpoint
CREATE TRIGGER os_wf_decision_immuable BEFORE UPDATE OR DELETE ON "os_wf_decision" FOR EACH ROW EXECUTE FUNCTION os_wf_decision_immuable();
