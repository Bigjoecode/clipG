CREATE TYPE "ai_operation" AS ENUM ('transcription', 'content_intelligence');
CREATE TYPE "ai_run_status" AS ENUM ('succeeded', 'failed');
CREATE TYPE "ai_error_category" AS ENUM (
  'authentication', 'content_policy', 'invalid_request', 'invalid_response',
  'provider_unavailable', 'quota', 'rate_limit', 'timeout', 'unknown'
);

CREATE TABLE "ai_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "media_asset_id" UUID,
  "media_job_id" UUID,
  "operation" "ai_operation" NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "model" VARCHAR(100) NOT NULL,
  "status" "ai_run_status" NOT NULL,
  "attempt" INTEGER NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "cached_tokens" INTEGER,
  "cache_write_tokens" INTEGER,
  "reasoning_tokens" INTEGER,
  "audio_seconds" DOUBLE PRECISION,
  "latency_ms" INTEGER NOT NULL,
  "provider_request_id" VARCHAR(255),
  "error_category" "ai_error_category",
  "estimated_cost_micros" BIGINT,
  "actual_cost_micros" BIGINT,
  "pricing_version" VARCHAR(100),
  "pricing_source_url" TEXT,
  "pricing_effective_from" DATE,
  "pricing_effective_through" DATE,
  "input_micros_per_million_tokens" INTEGER,
  "output_micros_per_million_tokens" INTEGER,
  "cached_input_micros_per_million_tokens" INTEGER,
  "cache_write_micros_per_million_tokens" INTEGER,
  "audio_micros_per_minute" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_runs_attempt_check" CHECK ("attempt" > 0),
  CONSTRAINT "ai_runs_latency_check" CHECK ("latency_ms" >= 0),
  CONSTRAINT "ai_runs_usage_check" CHECK (
    COALESCE("input_tokens", 0) >= 0 AND
    COALESCE("output_tokens", 0) >= 0 AND
    COALESCE("cached_tokens", 0) >= 0 AND
    COALESCE("cache_write_tokens", 0) >= 0 AND
    COALESCE("reasoning_tokens", 0) >= 0 AND
    COALESCE("audio_seconds", 0) >= 0
  ),
  CONSTRAINT "ai_runs_cost_check" CHECK (
    COALESCE("estimated_cost_micros", 0) >= 0 AND
    COALESCE("actual_cost_micros", 0) >= 0
  ),
  CONSTRAINT "ai_runs_status_error_check" CHECK (
    ("status" = 'succeeded' AND "error_category" IS NULL) OR
    ("status" = 'failed' AND "error_category" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ai_runs_media_job_id_attempt_key" ON "ai_runs"("media_job_id", "attempt");
CREATE INDEX "ai_runs_organization_id_created_at_idx" ON "ai_runs"("organization_id", "created_at");
CREATE INDEX "ai_runs_project_id_created_at_idx" ON "ai_runs"("project_id", "created_at");
CREATE INDEX "ai_runs_operation_provider_model_created_at_idx" ON "ai_runs"("operation", "provider", "model", "created_at");

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_media_asset_id_fkey"
  FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_media_job_id_fkey"
  FOREIGN KEY ("media_job_id") REFERENCES "media_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "prevent_ai_run_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Direct changes are forbidden. A parent-row cascade remains possible so
  -- tenant deletion and privacy erasure are not blocked by the ledger.
  IF pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'ai_runs is an append-only ledger';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ai_runs_append_only"
BEFORE UPDATE OR DELETE ON "ai_runs"
FOR EACH ROW EXECUTE FUNCTION "prevent_ai_run_mutation"();
