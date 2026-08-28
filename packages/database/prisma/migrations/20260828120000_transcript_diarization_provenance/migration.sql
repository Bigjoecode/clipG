-- AlterTable
ALTER TABLE "transcripts" ADD COLUMN     "diarized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "speaker_count" INTEGER;

-- Existing transcripts were produced by the diarizing OpenAI provider, so they
-- are backfilled rather than inheriting the non-diarized default. Derive the
-- known speaker count from their persisted segments while the data is local.
UPDATE "transcripts" AS "transcript"
SET
    "diarized" = true,
    "speaker_count" = (
        SELECT COUNT(DISTINCT "segment"."speaker")::INTEGER
        FROM "transcript_segments" AS "segment"
        WHERE "segment"."transcript_id" = "transcript"."id"
          AND "segment"."speaker" IS NOT NULL
    )
WHERE "transcript"."provider" = 'openai';
