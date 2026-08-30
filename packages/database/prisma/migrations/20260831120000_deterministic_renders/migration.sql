CREATE TYPE "render_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');
CREATE TYPE "render_error_category" AS ENUM (
  'invalid_edit_plan',
  'missing_source_media',
  'missing_asset',
  'unsupported_operation',
  'unsupported_codec',
  'renderer_failure',
  'storage_failure',
  'timeout'
);

CREATE TABLE "renders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "source_media_asset_id" UUID NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL,
  "edit_plan" JSONB NOT NULL,
  "asset_manifest" JSONB NOT NULL,
  "allow_ai_generated_assets" BOOLEAN NOT NULL DEFAULT false,
  "status" "render_status" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "backend" VARCHAR(32),
  "renderer_version" VARCHAR(32),
  "output_bucket" VARCHAR(100),
  "output_key" TEXT,
  "output_content_type" VARCHAR(100),
  "output_size_bytes" BIGINT,
  "output_duration_ms" INTEGER,
  "output_width" INTEGER,
  "output_height" INTEGER,
  "output_video_codec" VARCHAR(64),
  "output_audio_codec" VARCHAR(64),
  "render_duration_ms" INTEGER,
  "error_category" "render_error_category",
  "failure_reason" VARCHAR(500),
  "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "renders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "renders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "renders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "renders_source_media_asset_id_fkey" FOREIGN KEY ("source_media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "renders_organization_id_idempotency_key_key" ON "renders"("organization_id", "idempotency_key");
CREATE INDEX "renders_project_id_created_at_idx" ON "renders"("project_id", "created_at");
CREATE INDEX "renders_status_queued_at_idx" ON "renders"("status", "queued_at");

-- Application data remains behind NestJS. No browser/Data API policy is added.
ALTER TABLE "renders" ENABLE ROW LEVEL SECURITY;
