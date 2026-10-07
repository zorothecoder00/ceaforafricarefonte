CREATE TABLE "os_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_channel_seen" (
	"staff_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"last_id" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "os_channel_seen_staff_id_channel_id_pk" PRIMARY KEY("staff_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "os_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'En attente' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"hour" text NOT NULL,
	"duration" integer DEFAULT 60 NOT NULL,
	"place" text DEFAULT 'Visio' NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agenda" text DEFAULT '' NOT NULL,
	"minutes" text DEFAULT '' NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organizer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_message" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "os_message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"body" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"status" text DEFAULT 'À faire' NOT NULL,
	"country" text,
	"domain" text,
	"due" timestamp with time zone NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "os_channel_seen" ADD CONSTRAINT "os_channel_seen_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_channel_seen" ADD CONSTRAINT "os_channel_seen_channel_id_os_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."os_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_decision" ADD CONSTRAINT "os_decision_by_staff_id_fk" FOREIGN KEY ("by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_meeting" ADD CONSTRAINT "os_meeting_organizer_staff_id_fk" FOREIGN KEY ("organizer") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_message" ADD CONSTRAINT "os_message_channel_id_os_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."os_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_message" ADD CONSTRAINT "os_message_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_task" ADD CONSTRAINT "os_task_owner_staff_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_task" ADD CONSTRAINT "os_task_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "os_meeting_at_idx" ON "os_meeting" USING btree ("at");--> statement-breakpoint
CREATE INDEX "os_message_channel_idx" ON "os_message" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "os_task_owner_idx" ON "os_task" USING btree ("owner");