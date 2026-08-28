-- AlterEnum
ALTER TYPE "media_job_type" ADD VALUE 'transcription';

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "language" VARCHAR(16),
    "text" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transcript_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "start_seconds" DOUBLE PRECISION NOT NULL,
    "end_seconds" DOUBLE PRECISION NOT NULL,
    "speaker" VARCHAR(64),
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_media_asset_id_key" ON "transcripts"("media_asset_id");
CREATE INDEX "transcripts_organization_id_created_at_idx" ON "transcripts"("organization_id", "created_at");
CREATE INDEX "transcripts_project_id_updated_at_idx" ON "transcripts"("project_id", "updated_at");
CREATE UNIQUE INDEX "transcript_segments_transcript_id_index_key" ON "transcript_segments"("transcript_id", "index");
CREATE INDEX "transcript_segments_transcript_id_start_seconds_idx" ON "transcript_segments"("transcript_id", "start_seconds");

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_segments" ENABLE ROW LEVEL SECURITY;
