-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('source_video');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('upload_pending', 'uploaded', 'failed');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "kind" "media_kind" NOT NULL DEFAULT 'source_video',
    "status" "media_status" NOT NULL DEFAULT 'upload_pending',
    "original_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_provider" VARCHAR(32) NOT NULL,
    "storage_bucket" VARCHAR(100) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "failure_reason" VARCHAR(255),
    "uploaded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_provider_storage_bucket_storage_key_key" ON "media_assets"("storage_provider", "storage_bucket", "storage_key");

-- CreateIndex
CREATE INDEX "media_assets_organization_id_created_at_idx" ON "media_assets"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_project_id_status_idx" ON "media_assets"("project_id", "status");

-- CreateIndex
CREATE INDEX "media_assets_uploaded_by_id_idx" ON "media_assets"("uploaded_by_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
