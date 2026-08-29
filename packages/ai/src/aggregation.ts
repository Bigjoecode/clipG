import type { AiOperation } from './pricing.js';

export interface AiUsageLedgerRecord {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly operation: AiOperation;
  readonly provider: string;
  readonly model: string;
  readonly createdAt: Date;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly audioSeconds: number | null;
  readonly estimatedCostMicros: bigint | null;
  readonly actualCostMicros: bigint | null;
}

export interface AiUsageTotal {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly operation: AiOperation;
  readonly provider: string;
  readonly model: string;
  readonly date: string;
  readonly attempts: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
  readonly audioSeconds: number;
  readonly estimatedCostMicros: bigint | null;
  readonly actualCostMicros: bigint | null;
}

/**
 * Deterministic rollup used by future usage/billing APIs. The database indexes
 * support selecting a bounded tenant/date range before calling this function.
 */
export function aggregateAiUsage(
  records: readonly AiUsageLedgerRecord[],
): readonly AiUsageTotal[] {
  const totals = new Map<string, AiUsageTotal>();
  for (const record of records) {
    const date = record.createdAt.toISOString().slice(0, 10);
    const key = JSON.stringify([
      record.organizationId,
      record.projectId,
      record.operation,
      record.provider,
      record.model,
      date,
    ]);
    const existing = totals.get(key);
    const estimated = addNullableCost(
      existing?.estimatedCostMicros ?? null,
      record.estimatedCostMicros,
    );
    const actual = addNullableCost(
      existing?.actualCostMicros ?? null,
      record.actualCostMicros,
    );
    totals.set(key, {
      actualCostMicros: actual,
      attempts: (existing?.attempts ?? 0) + 1,
      audioSeconds: (existing?.audioSeconds ?? 0) + (record.audioSeconds ?? 0),
      cachedTokens: (existing?.cachedTokens ?? 0) + (record.cachedTokens ?? 0),
      date,
      estimatedCostMicros: estimated,
      inputTokens: (existing?.inputTokens ?? 0) + (record.inputTokens ?? 0),
      model: record.model,
      operation: record.operation,
      organizationId: record.organizationId,
      outputTokens: (existing?.outputTokens ?? 0) + (record.outputTokens ?? 0),
      projectId: record.projectId,
      provider: record.provider,
      reasoningTokens:
        (existing?.reasoningTokens ?? 0) + (record.reasoningTokens ?? 0),
    });
  }
  return [...totals.values()].sort((left, right) =>
    [
      left.organizationId,
      left.projectId ?? '',
      left.operation,
      left.provider,
      left.model,
      left.date,
    ]
      .join('\u0000')
      .localeCompare(
        [
          right.organizationId,
          right.projectId ?? '',
          right.operation,
          right.provider,
          right.model,
          right.date,
        ].join('\u0000'),
      ),
  );
}

function addNullableCost(
  current: bigint | null,
  next: bigint | null,
): bigint | null {
  if (current === null && next === null) return null;
  return (current ?? 0n) + (next ?? 0n);
}
