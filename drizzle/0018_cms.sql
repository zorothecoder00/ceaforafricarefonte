CREATE TYPE "public"."cms_status" AS ENUM('brouillon', 'en_relecture', 'valide', 'programme', 'publie', 'archive');--> statement-breakpoint
CREATE TABLE "cms_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'article' NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"lang" text DEFAULT 'fr' NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"category" text,
	"country" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"featured" boolean DEFAULT false NOT NULL,
	"status" "cms_status" DEFAULT 'brouillon' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"author_id" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"name" text NOT NULL,
	"alt" text NOT NULL,
	"credit" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "cms_status" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_content" ADD CONSTRAINT "cms_content_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content" ADD CONSTRAINT "cms_content_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media" ADD CONSTRAINT "cms_media_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_revision" ADD CONSTRAINT "cms_revision_content_id_cms_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."cms_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_revision" ADD CONSTRAINT "cms_revision_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_content_slug_unique" ON "cms_content" USING btree ("type","lang","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_content_key_lang_unique" ON "cms_content" USING btree ("key","lang");--> statement-breakpoint
CREATE INDEX "cms_content_status_idx" ON "cms_content" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "cms_revision_content_idx" ON "cms_revision" USING btree ("content_id","version");