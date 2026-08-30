import { createHash } from 'node:crypto';

import {
  CreativeDirectorProviderError,
  type CreativeDirector,
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
    private readonly director: CreativeDirector,
  ) {}

  public async execute(
    input: CreativeDirectorInput,
    context: CreativeDirectorExecutionContext,
  ): Promise<CreativeDirectorOutput> {
    const startedAt = Date.now();
    try {
      const output = await this.director.direct(input, {
        safetyIdentifier: createHash('sha256')
          .update(context.organizationId)
          .digest('hex'),
      });
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
        status: 'SUCCEEDED',
        usage: output.usage,
      });
      return output;
    } catch (error) {
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
