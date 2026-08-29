-- Task 008: durable, tenant-scoped content intelligence and first-class
-- opportunities. PostgreSQL remains the source of truth; Redis only transports
-- the corresponding background job.

ALTER TYPE "media_job_type" ADD VALUE 'content_intelligence';

CREATE TYPE "content_opportunity_type" AS ENUM (
  'story',
  'argument',
  'insight',
  'question_answer',
  'quote',
  'hook',
  'call_to_action',
  'emotional_moment',
  'visual_opportunity'
);

CREATE TYPE "content_platform" AS ENUM (
  'youtube',
  'instagram',
  'tiktok',
  'facebook'
);

CREATE TABLE "content_analyses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "transcript_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "model" VARCHAR(100) NOT NULL,
  "prompt_id" VARCHAR(100) NOT NULL,
  "prompt_version" INTEGER NOT NULL,
  "transcript_updated_at" TIMESTAMPTZ(3) NOT NULL,
  "summary" TEXT NOT NULL,
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "content_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_analyses_prompt_version_check" CHECK ("prompt_version" > 0)
);

CREATE TABLE "content_opportunities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "analysis_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "index" INTEGER NOT NULL,
  "type" "content_opportunity_type" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "topic" VARCHAR(160) NOT NULL,
  "hook" VARCHAR(280) NOT NULL,
  "summary" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidence_text" TEXT NOT NULL,
  "start_seconds" DOUBLE PRECISION NOT NULL,
  "end_seconds" DOUBLE PRECISION NOT NULL,
  "recommended_duration_seconds" INTEGER NOT NULL,
  "recommended_platforms" "content_platform"[] NOT NULL,
  "hook_score" INTEGER NOT NULL,
  "clarity_score" INTEGER NOT NULL,
  "emotional_impact_score" INTEGER NOT NULL,
  "standalone_value_score" INTEGER NOT NULL,
  "retention_potential_score" INTEGER NOT NULL,
  "platform_fit_score" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "content_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_opportunities_time_check" CHECK (
    "start_seconds" >= 0 AND "end_seconds" > "start_seconds"
  ),
  CONSTRAINT "content_opportunities_duration_check" CHECK (
    "recommended_duration_seconds" > 0
  ),
  CONSTRAINT "content_opportunities_scores_check" CHECK (
    "hook_score" BETWEEN 0 AND 100
    AND "clarity_score" BETWEEN 0 AND 100
    AND "emotional_impact_score" BETWEEN 0 AND 100
    AND "standalone_value_score" BETWEEN 0 AND 100
    AND "retention_potential_score" BETWEEN 0 AND 100
    AND "platform_fit_score" BETWEEN 0 AND 100
  )
);

CREATE UNIQUE INDEX "content_analyses_media_asset_id_key" ON "content_analyses"("media_asset_id");
CREATE UNIQUE INDEX "content_analyses_transcript_id_key" ON "content_analyses"("transcript_id");
CREATE INDEX "content_analyses_organization_id_created_at_idx" ON "content_analyses"("organization_id", "created_at");
CREATE INDEX "content_analyses_project_id_updated_at_idx" ON "content_analyses"("project_id", "updated_at");
CREATE UNIQUE INDEX "content_opportunities_analysis_id_index_key" ON "content_opportunities"("analysis_id", "index");
CREATE INDEX "content_opportunities_media_asset_id_start_seconds_idx" ON "content_opportunities"("media_asset_id", "start_seconds");
CREATE INDEX "content_opportunities_project_id_type_idx" ON "content_opportunities"("project_id", "type");

ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "content_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_opportunities" ENABLE ROW LEVEL SECURITY;
