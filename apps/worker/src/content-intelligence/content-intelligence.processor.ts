import { createHash, randomUUID } from 'node:crypto';

import {
  ContentIntelligenceProviderError,
  type ContentIntelligenceProvider,
} from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';
import { parseContentIntelligenceJobEnvironment } from '@clipgenius/config';
import {
  contentIntelligenceQueueName,
  type ContentIntelligenceJobData,
} from '@clipgenius/types';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';

export const CONTENT_INTELLIGENCE_PROVIDER = Symbol(
  'CONTENT_INTELLIGENCE_PROVIDER',
);
export const CONTENT_INTELLIGENCE_SETTINGS = Symbol(
  'CONTENT_INTELLIGENCE_SETTINGS',
);

export interface ContentIntelligenceSettings {
  readonly attempts: number;
  readonly maxTranscriptCharacters: number;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly systemPrompt: string;
}

class PermanentContentIntelligenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentContentIntelligenceError';
  }
}

function failureText(error: unknown): string {
  return (
    error instanceof Error
      ? error.message
      : 'The content intelligence job failed.'
  ).slice(0, 500);
}

@Processor(contentIntelligenceQueueName, {
  concurrency: parseContentIntelligenceJobEnvironment(process.env)
    .CONTENT_INTELLIGENCE_CONCURRENCY,
})
export class ContentIntelligenceProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentIntelligenceProcessor.name);

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(CONTENT_INTELLIGENCE_PROVIDER)
    private readonly provider: ContentIntelligenceProvider,
    @Inject(CONTENT_INTELLIGENCE_SETTINGS)
    private readonly settings: ContentIntelligenceSettings,
  ) {
    super();
  }

  public override async process(
    job: Job<ContentIntelligenceJobData>,
  ): Promise<void> {
    const record = await this.database.mediaJob.findUnique({
      include: {
        mediaAsset: {
          include: {
            project: true,
            transcript: {
              include: { segments: { orderBy: { index: 'asc' } } },
            },
          },
        },
      },
      where: { id: job.data.mediaJobId },
    });
    if (record === null) {
      this.logger.log(
        `Content intelligence job ${job.data.mediaJobId} no longer exists; skipping.`,
      );
      return;
    }
    if (record.status === 'SUCCEEDED') {
      return;
    }

    const attempts = record.attempts + 1;
    try {
      if (
        record.type !== 'CONTENT_INTELLIGENCE' ||
        record.mediaAssetId !== job.data.mediaAssetId ||
        record.organizationId !== job.data.organizationId ||
        record.projectId !== job.data.projectId
      ) {
        throw new PermanentContentIntelligenceError(
          'The queued job did not match the stored content intelligence record.',
        );
      }
      const { mediaAsset } = record;
      const { transcript } = mediaAsset;
      if (mediaAsset.status !== 'UPLOADED' || transcript === null) {
        throw new PermanentContentIntelligenceError(
          'A completed transcript is required for content intelligence.',
        );
      }
      const durationSeconds =
        transcript.durationSeconds ?? mediaAsset.durationSeconds;
      if (durationSeconds === null || durationSeconds <= 0) {
        throw new PermanentContentIntelligenceError(
          'The transcript has no valid source duration.',
        );
      }
      const characterCount = transcript.segments.reduce(
        (total, segment) => total + segment.text.length,
        0,
      );
      if (characterCount > this.settings.maxTranscriptCharacters) {
        throw new PermanentContentIntelligenceError(
          'The transcript is larger than the content intelligence limit.',
        );
      }

      await this.database.mediaJob.update({
        data: {
          attempts,
          failureReason: null,
          finishedAt: null,
          startedAt: new Date(),
          status: 'RUNNING',
        },
        where: { id: record.id },
      });

      const result = await this.provider.analyze({
        diarized: transcript.diarized,
        durationSeconds,
        language: transcript.language,
        project: {
          description: mediaAsset.project.description,
          name: mediaAsset.project.name,
        },
        safetyIdentifier: createHash('sha256')
          .update(mediaAsset.organizationId)
          .digest('hex'),
        segments: transcript.segments.map((segment) => ({
          endSeconds: segment.endSeconds,
          speaker: segment.speaker,
          startSeconds: segment.startSeconds,
          text: segment.text,
        })),
        speakerCount: transcript.speakerCount,
        systemPrompt: this.settings.systemPrompt,
      });

      const existing = await this.database.contentAnalysis.findUnique({
        select: { id: true },
        where: { mediaAssetId: mediaAsset.id },
      });
      const analysisId = existing?.id ?? randomUUID();
      await this.database.$transaction([
        this.database.contentAnalysis.upsert({
          create: {
            id: analysisId,
            keywords: [...result.keywords],
            mediaAssetId: mediaAsset.id,
            model: result.model,
            organizationId: mediaAsset.organizationId,
            projectId: mediaAsset.projectId,
            promptId: this.settings.promptId,
            promptVersion: this.settings.promptVersion,
            provider: result.provider,
            summary: result.summary,
            topics: [...result.topics],
            transcriptId: transcript.id,
            transcriptUpdatedAt: transcript.updatedAt,
          },
          update: {
            keywords: [...result.keywords],
            model: result.model,
            promptId: this.settings.promptId,
            promptVersion: this.settings.promptVersion,
            provider: result.provider,
            summary: result.summary,
            topics: [...result.topics],
            transcriptId: transcript.id,
            transcriptUpdatedAt: transcript.updatedAt,
          },
          where: { mediaAssetId: mediaAsset.id },
        }),
        this.database.contentOpportunity.deleteMany({ where: { analysisId } }),
        this.database.contentOpportunity.createMany({
          data: result.opportunities.map((opportunity, index) => ({
            analysisId,
            clarityScore: opportunity.scores.clarity,
            emotionalImpactScore: opportunity.scores.emotionalImpact,
            endSeconds: opportunity.endSeconds,
            evidenceText: opportunity.evidenceText,
            hook: opportunity.hook,
            hookScore: opportunity.scores.hook,
            index,
            mediaAssetId: mediaAsset.id,
            organizationId: mediaAsset.organizationId,
            platformFitScore: opportunity.scores.platformFit,
            projectId: mediaAsset.projectId,
            rationale: opportunity.rationale,
            recommendedDurationSeconds: opportunity.recommendedDurationSeconds,
            recommendedPlatforms: [...opportunity.recommendedPlatforms],
            retentionPotentialScore: opportunity.scores.retentionPotential,
            standaloneValueScore: opportunity.scores.standaloneValue,
            startSeconds: opportunity.startSeconds,
            summary: opportunity.summary,
            title: opportunity.title,
            topic: opportunity.topic,
            type: opportunity.type,
          })),
        }),
        this.database.mediaJob.update({
          data: {
            failureReason: null,
            finishedAt: new Date(),
            status: 'SUCCEEDED',
          },
          where: { id: record.id },
        }),
      ]);
      this.logger.log(
        `Analyzed content for media ${mediaAsset.id} with ${result.provider}: ${result.opportunities.length} opportunity(s).`,
      );
    } catch (error) {
      const permanent =
        error instanceof PermanentContentIntelligenceError ||
        (error instanceof ContentIntelligenceProviderError && !error.retryable);
      const exhausted = attempts >= this.settings.attempts;
      await this.database.mediaJob.update({
        data: {
          attempts,
          failureReason: failureText(error),
          ...(permanent || exhausted
            ? { finishedAt: new Date(), status: 'FAILED' as const }
            : { status: 'QUEUED' as const }),
        },
        where: { id: record.id },
      });
      this.logger.error(
        `Content intelligence failed for media ${record.mediaAssetId} (attempt ${attempts}): ${failureText(error)}`,
      );
      if (permanent) {
        throw new UnrecoverableError(failureText(error));
      }
      throw error;
    }
  }
}
