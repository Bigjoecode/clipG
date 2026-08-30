import {
  emptyAiUsage,
  estimateAiCost,
  type AiErrorCategory,
  type AiOperation,
  type AiUsage,
} from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';

export interface RecordAiRunInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly mediaAssetId: string;
  readonly mediaJobId: string;
  readonly operation: AiOperation;
  readonly stage?: string;
  readonly provider: string;
  readonly model: string;
  readonly attempt: number;
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly usage?: AiUsage;
  readonly latencyMs: number;
  readonly errorCategory?: AiErrorCategory;
  readonly occurredAt?: Date;
}

/** Append one immutable ledger row after one real provider attempt. */
export async function recordAiRun(
  database: PrismaClient,
  input: RecordAiRunInput,
): Promise<void> {
  const usage = input.usage ?? emptyAiUsage(input.latencyMs);
  const normalizedUsage = {
    ...usage,
    latencyMs:
      usage.latencyMs > 0 ? usage.latencyMs : Math.max(0, input.latencyMs),
  };
  const estimate = estimateAiCost({
    model: input.model,
    ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
    operation: input.operation,
    provider: input.provider,
    usage: normalizedUsage,
  });
  await database.aiRun.create({
    data: {
      actualCostMicros: null,
      attempt: input.attempt,
      audioMicrosPerMinute: estimate.pricing?.audioMicrosPerMinute ?? null,
      audioSeconds: normalizedUsage.audioSeconds,
      cachedInputMicrosPerMillionTokens:
        estimate.pricing?.cachedInputMicrosPerMillionTokens ?? null,
      cachedTokens: normalizedUsage.cachedInputTokens,
      cacheWriteMicrosPerMillionTokens:
        estimate.pricing?.cacheWriteMicrosPerMillionTokens ?? null,
      cacheWriteTokens: normalizedUsage.cacheWriteTokens,
      errorCategory:
        input.status === 'FAILED' ? (input.errorCategory ?? 'UNKNOWN') : null,
      estimatedCostMicros: estimate.estimatedCostMicros,
      inputMicrosPerMillionTokens:
        estimate.pricing?.inputMicrosPerMillionTokens ?? null,
      inputTokens: normalizedUsage.inputTokens,
      latencyMs: normalizedUsage.latencyMs,
      mediaAssetId: input.mediaAssetId,
      mediaJobId: input.mediaJobId,
      model: input.model,
      operation: input.operation,
      organizationId: input.organizationId,
      outputMicrosPerMillionTokens:
        estimate.pricing?.outputMicrosPerMillionTokens ?? null,
      outputTokens: normalizedUsage.outputTokens,
      pricingEffectiveFrom:
        estimate.pricing === null
          ? null
          : new Date(`${estimate.pricing.effectiveFrom}T00:00:00.000Z`),
      pricingEffectiveThrough:
        estimate.pricing?.effectiveThrough === null ||
        estimate.pricing?.effectiveThrough === undefined
          ? null
          : new Date(`${estimate.pricing.effectiveThrough}T00:00:00.000Z`),
      pricingVersion: estimate.pricing?.version ?? null,
      pricingSourceUrl: estimate.pricing?.sourceUrl ?? null,
      projectId: input.projectId,
      provider: input.provider,
      providerRequestId: normalizedUsage.requestId,
      reasoningTokens: normalizedUsage.reasoningTokens,
      stage: input.stage ?? 'LEGACY',
      status: input.status,
    },
  });
}
