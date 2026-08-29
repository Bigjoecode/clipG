import { describe, expect, it } from 'vitest';

import {
  aggregateAiUsage,
  emptyAiUsage,
  estimateAiCost,
} from '../src/index.js';

describe('AI pricing', () => {
  it('estimates Deepgram Nova-2 plus diarization in integer micro-dollars', () => {
    const result = estimateAiCost({
      model: 'nova-2',
      operation: 'TRANSCRIPTION',
      provider: 'deepgram',
      usage: { ...emptyAiUsage(120), audioSeconds: 90 },
    });
    expect(result.estimatedCostMicros).toBe(9_450n);
    expect(result.pricing?.version).toBe('deepgram-2026-08-29');
  });

  it('prices Gemini tokens and preserves a versioned rate snapshot', () => {
    const result = estimateAiCost({
      model: 'gemini-3.6-flash',
      operation: 'CONTENT_INTELLIGENCE',
      provider: 'gemini',
      usage: {
        ...emptyAiUsage(400),
        cachedInputTokens: 1_000_000,
        inputTokens: 2_000_000,
        outputTokens: 100_000,
        reasoningTokens: 10_000,
      },
    });
    expect(result.estimatedCostMicros).toBe(1_237_500n);
    expect(result.pricing).toMatchObject({
      effectiveFrom: '2026-08-29',
      version: 'gemini-2026-08-29',
    });
  });

  it('does not fabricate a cost for an unapproved provider/model price', () => {
    expect(
      estimateAiCost({
        model: 'future-model',
        operation: 'CONTENT_INTELLIGENCE',
        provider: 'anthropic',
        usage: { ...emptyAiUsage(1), inputTokens: 5 },
      }),
    ).toEqual({ estimatedCostMicros: null, pricing: null });
  });

  it('does not apply an expired promotional price to future usage', () => {
    const result = estimateAiCost({
      model: 'gemini-3.6-flash',
      occurredAt: new Date('2027-01-01T00:00:00Z'),
      operation: 'CONTENT_INTELLIGENCE',
      provider: 'gemini',
      usage: { ...emptyAiUsage(1), inputTokens: 10 },
    });
    expect(result).toEqual({ estimatedCostMicros: null, pricing: null });
  });
});

describe('AI usage aggregation', () => {
  it('groups by tenant, project, operation, provider, model, and UTC date', () => {
    const base = {
      actualCostMicros: null,
      audioSeconds: null,
      cachedTokens: 5,
      createdAt: new Date('2026-08-29T10:00:00Z'),
      estimatedCostMicros: 10n,
      inputTokens: 100,
      model: 'gemini-3.6-flash',
      operation: 'CONTENT_INTELLIGENCE' as const,
      organizationId: 'org-1',
      outputTokens: 20,
      projectId: 'project-1',
      provider: 'gemini',
      reasoningTokens: 2,
    };
    const totals = aggregateAiUsage([
      base,
      { ...base, createdAt: new Date('2026-08-29T23:59:59Z') },
      { ...base, createdAt: new Date('2026-08-30T00:00:00Z') },
    ]);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({
      attempts: 2,
      cachedTokens: 10,
      date: '2026-08-29',
      estimatedCostMicros: 20n,
      inputTokens: 200,
      outputTokens: 40,
      reasoningTokens: 4,
    });
  });
});
