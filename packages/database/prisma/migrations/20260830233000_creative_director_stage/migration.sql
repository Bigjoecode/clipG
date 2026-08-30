ALTER TABLE "ai_runs"
ADD COLUMN "stage" VARCHAR(32) NOT NULL DEFAULT 'LEGACY';

CREATE INDEX "ai_runs_operation_stage_created_at_idx"
ON "ai_runs"("operation", "stage", "created_at");
