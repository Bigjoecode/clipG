import type { AiUsage } from './usage.js';

export type AiOperation = 'CONTENT_INTELLIGENCE' | 'TRANSCRIPTION';

export interface AiPricingSnapshot {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveThrough: string | null;
  readonly sourceUrl: string;
  readonly inputMicrosPerMillionTokens: number | null;
  readonly outputMicrosPerMillionTokens: number | null;
  readonly cachedInputMicrosPerMillionTokens: number | null;
  readonly cacheWriteMicrosPerMillionTokens: number | null;
  readonly audioMicrosPerMinute: number | null;
}

export interface AiCostEstimate {
  readonly estimatedCostMicros: bigint | null;
  readonly pricing: AiPricingSnapshot | null;
}

interface PricingEntry extends AiPricingSnapshot {
  readonly operation: AiOperation;
  readonly provider: string;
  readonly model: string;
}

/**
 * Versioned deployment pricing catalog. Rates are integer micro-dollars and a
 * copy is persisted on every AI run, so historical estimates do not change
 * when this catalog is updated. Unknown models deliberately remain unpriced.
 */
const pricingCatalog: readonly PricingEntry[] = [
  {
    audioMicrosPerMinute: 6_300,
    cachedInputMicrosPerMillionTokens: null,
    cacheWriteMicrosPerMillionTokens: null,
    effectiveFrom: '2026-08-29',
    effectiveThrough: null,
    sourceUrl: 'https://deepgram.com/pricing',
    inputMicrosPerMillionTokens: null,
    model: 'nova-2',
    operation: 'TRANSCRIPTION',
    outputMicrosPerMillionTokens: null,
    provider: 'deepgram',
    version: 'deepgram-2026-08-29',
  },
  {
    audioMicrosPerMinute: null,
    cachedInputMicrosPerMillionTokens: 75_000,
    cacheWriteMicrosPerMillionTokens: null,
    effectiveFrom: '2026-08-29',
    effectiveThrough: '2026-12-31',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    inputMicrosPerMillionTokens: 750_000,
    model: 'gemini-3.6-flash',
    operation: 'CONTENT_INTELLIGENCE',
    outputMicrosPerMillionTokens: 3_750_000,
    provider: 'gemini',
    version: 'gemini-2026-08-29',
  },
];

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function tokenCost(tokens: number, rate: number): bigint {
  return roundedDivide(BigInt(tokens) * BigInt(rate), 1_000_000n);
}

export function estimateAiCost(input: {
  readonly operation: AiOperation;
  readonly provider: string;
  readonly model: string;
  readonly usage: AiUsage;
  readonly occurredAt?: Date;
}): AiCostEstimate {
  const date = (input.occurredAt ?? new Date()).toISOString().slice(0, 10);
  const entry = [...pricingCatalog]
    .filter(
      (candidate) =>
        candidate.operation === input.operation &&
        candidate.provider === input.provider &&
        candidate.model === input.model &&
        candidate.effectiveFrom <= date &&
        (candidate.effectiveThrough === null ||
          candidate.effectiveThrough >= date),
    )
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    )[0];
  if (entry === undefined) {
    return { estimatedCostMicros: null, pricing: null };
  }

  let total = 0n;
  let measured = false;
  const addTokens = (tokens: number | null, rate: number | null): void => {
    if (tokens !== null && rate !== null) {
      total += tokenCost(tokens, rate);
      measured = true;
    }
  };
  const uncachedInputTokens =
    input.usage.inputTokens === null
      ? null
      : Math.max(
          0,
          input.usage.inputTokens - (input.usage.cachedInputTokens ?? 0),
        );
  addTokens(uncachedInputTokens, entry.inputMicrosPerMillionTokens);
  addTokens(input.usage.outputTokens, entry.outputMicrosPerMillionTokens);
  addTokens(input.usage.reasoningTokens, entry.outputMicrosPerMillionTokens);
  addTokens(
    input.usage.cachedInputTokens,
    entry.cachedInputMicrosPerMillionTokens,
  );
  addTokens(
    input.usage.cacheWriteTokens,
    entry.cacheWriteMicrosPerMillionTokens,
  );
  if (
    input.usage.audioSeconds !== null &&
    entry.audioMicrosPerMinute !== null
  ) {
    const milliseconds = Math.round(input.usage.audioSeconds * 1_000);
    total += roundedDivide(
      BigInt(milliseconds) * BigInt(entry.audioMicrosPerMinute),
      60_000n,
    );
    measured = true;
  }

  const pricing: AiPricingSnapshot = {
    audioMicrosPerMinute: entry.audioMicrosPerMinute,
    cachedInputMicrosPerMillionTokens: entry.cachedInputMicrosPerMillionTokens,
    cacheWriteMicrosPerMillionTokens: entry.cacheWriteMicrosPerMillionTokens,
    effectiveFrom: entry.effectiveFrom,
    effectiveThrough: entry.effectiveThrough,
    inputMicrosPerMillionTokens: entry.inputMicrosPerMillionTokens,
    outputMicrosPerMillionTokens: entry.outputMicrosPerMillionTokens,
    sourceUrl: entry.sourceUrl,
    version: entry.version,
  };
  return {
    estimatedCostMicros: measured ? total : null,
    pricing,
  };
}

export function aiPricingCatalog(): readonly Readonly<PricingEntry>[] {
  return pricingCatalog;
}
