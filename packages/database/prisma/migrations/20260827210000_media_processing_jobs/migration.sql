-- CreateEnum
CREATE TYPE "media_job_type" AS ENUM ('media_probe');

-- CreateEnum
CREATE TYPE "media_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "audio_codec" VARCHAR(64),
ADD COLUMN     "bit_rate" INTEGER,
ADD COLUMN     "duration_seconds" DOUBLE PRECISION,
ADD COLUMN     "frame_rate" DOUBLE PRECISION,
ADD COLUMN     "has_audio" BOOLEAN,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "probed_at" TIMESTAMPTZ(3),
ADD COLUMN     "video_codec" VARCHAR(64),
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "media_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "type" "media_job_type" NOT NULL,
    "status" "media_job_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(500),
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_jobs_organization_id_created_at_idx" ON "media_jobs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "media_jobs_status_queued_at_idx" ON "media_jobs"("status", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_jobs_media_asset_id_type_key" ON "media_jobs"("media_asset_id", "type");

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_jobs" ENABLE ROW LEVEL SECURITY;
