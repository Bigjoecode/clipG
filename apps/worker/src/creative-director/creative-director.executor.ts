import { createHash } from 'node:crypto';

import {
  CreativeDirectorProviderError,
  type CreativeDirectorAttempt,
  type CreativeDirectorInput,
  type CreativeDirectorOutput,
} from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';

import { recordAiRun } from '../ai-run-ledger.js';

export interface CreativeDirectorExecutionContext {
  readonly attempt: number;
  readonly mediaAssetId: string;
  readonly mediaJobId: string;
  readonly model: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly provider: string;
}

interface CreativeDirectorRunner {
  direct(
    input: CreativeDirectorInput,
    context: {
      readonly onAttempt?: (
        attempt: CreativeDirectorAttempt,
      ) => Promise<void> | void;
      readonly safetyIdentifier: string;
    },
  ): Promise<CreativeDirectorOutput>;
}

/**
 * Worker-side accounting boundary for a Creative Director provider attempt.
 *
 * Queue and persistence orchestration deliberately remain outside Task 010,
 * but every eventual worker call goes through this executor so success and
 * failure use the existing append-only AiRun ledger instead of a second meter.
 */
export class CreativeDirectorExecutor {
  public constructor(
    private readonly database: PrismaClient,
    private readonly director: CreativeDirectorRunner,
  ) {}

  public async execute(
    input: CreativeDirectorInput,
    context: CreativeDirectorExecutionContext,
  ): Promise<CreativeDirectorOutput> {
    const startedAt = Date.now();
    let recordedAttempts = 0;
    const recordAttempt = async (
      providerAttempt: CreativeDirectorAttempt,
    ): Promise<void> => {
      recordedAttempts += 1;
      await recordAiRun(this.database, {
        attempt: (context.attempt - 1) * 100 + providerAttempt.attempt,
        ...(providerAttempt.errorCategory === undefined
          ? {}
          : { errorCategory: providerAttempt.errorCategory }),
        latencyMs: providerAttempt.latencyMs,
        mediaAssetId: context.mediaAssetId,
        mediaJobId: context.mediaJobId,
        model: providerAttempt.model,
        operation: 'CREATIVE_DIRECTOR',
        organizationId: context.organizationId,
        projectId: context.projectId,
        provider: providerAttempt.provider,
        stage: providerAttempt.stage,
        status: providerAttempt.status,
        usage: providerAttempt.usage,
      });
    };
    try {
      const output = await this.director.direct(input, {
        onAttempt: recordAttempt,
        safetyIdentifier: createHash('sha256')
          .update(context.organizationId)
          .digest('hex'),
      });
      if (recordedAttempts === 0)
        await recordAiRun(this.database, {
          attempt: context.attempt,
          latencyMs: Date.now() - startedAt,
          mediaAssetId: context.mediaAssetId,
          mediaJobId: context.mediaJobId,
          model: output.model,
          operation: 'CREATIVE_DIRECTOR',
          organizationId: context.organizationId,
          projectId: context.projectId,
          provider: output.provider,
          stage: 'LEGACY',
          status: 'SUCCEEDED',
          usage: output.usage,
        });
      return output;
    } catch (error) {
      if (recordedAttempts === 0)
        await recordAiRun(this.database, {
          attempt: context.attempt,
          errorCategory:
            error instanceof CreativeDirectorProviderError
              ? error.category
              : 'UNKNOWN',
          latencyMs: Date.now() - startedAt,
          mediaAssetId: context.mediaAssetId,
          mediaJobId: context.mediaJobId,
          model: context.model,
          operation: 'CREATIVE_DIRECTOR',
          organizationId: context.organizationId,
          projectId: context.projectId,
          provider: context.provider,
          stage: 'LEGACY',
          status: 'FAILED',
          ...(error instanceof CreativeDirectorProviderError &&
          error.usage !== undefined
            ? { usage: error.usage }
            : {}),
        });
      throw error;
    }
  }
}
