import { describe, expect, it, vi } from 'vitest';

import {
  ContentIntelligenceProviderError,
  OpenAIContentIntelligenceProvider,
} from '../src/index.js';

const result = {
  keywords: ['faith', 'forgiveness'],
  opportunities: [
    {
      endSeconds: 42,
      evidenceText: 'Forgiveness is freedom from carrying yesterday.',
      hook: 'What if forgiveness is really freedom?',
      rationale: 'A concise, self-contained claim with emotional relevance.',
      recommendedDurationSeconds: 22,
      recommendedPlatforms: ['YOUTUBE', 'INSTAGRAM', 'TIKTOK'],
      scores: {
        clarity: 92,
        emotionalImpact: 88,
        hook: 90,
        platformFit: 91,
        retentionPotential: 89,
        standaloneValue: 94,
      },
      startSeconds: 20,
      summary: 'A teaching moment reframing forgiveness as personal freedom.',
      title: 'Forgiveness Is Freedom',
      topic: 'Forgiveness',
      type: 'INSIGHT',
    },
  ],
  summary: 'A sermon about faith and forgiveness.',
  topics: ['Faith', 'Forgiveness'],
} as const;

function request() {
  return {
    diarized: true,
    durationSeconds: 65,
    language: 'en',
    project: { description: 'Sunday clips', name: 'Sunday Service' },
    safetyIdentifier: 'privacy-safe-id',
    segments: [
      {
        endSeconds: 42,
        speaker: 'speaker_0',
        startSeconds: 20,
        text: 'Forgiveness is freedom from carrying yesterday.',
      },
    ],
    speakerCount: 1,
    systemPrompt: 'Analyze only supplied evidence.',
  } as const;
}

describe('OpenAIContentIntelligenceProvider', () => {
  it('returns schema-validated, source-timed intelligence', async () => {
    const providerRequest = vi.fn().mockResolvedValue(result);
    const provider = new OpenAIContentIntelligenceProvider({
      apiKey: 'test-openai-key-not-a-secret',
      model: 'gpt-5.6-terra',
      request: providerRequest,
      timeoutMs: 30_000,
    });

    await expect(provider.analyze(request())).resolves.toMatchObject({
      model: 'gpt-5.6-terra',
      opportunities: [{ title: 'Forgiveness Is Freedom' }],
      provider: 'openai',
    });
    expect(providerRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-terra',
        safetyIdentifier: 'privacy-safe-id',
        systemPrompt: 'Analyze only supplied evidence.',
      }),
      { timeout: 30_000 },
    );
  });

  it('preserves normalized OpenAI token and request usage', async () => {
    const usage = {
      audioSeconds: null,
      cachedInputTokens: 20,
      cacheWriteTokens: null,
      inputTokens: 100,
      latencyMs: 0,
      outputTokens: 40,
      reasoningTokens: 5,
      requestId: 'response-1',
    };
    const provider = new OpenAIContentIntelligenceProvider({
      apiKey: 'test-openai-key-not-a-secret',
      model: 'gpt-5.6-terra',
      request: vi.fn().mockResolvedValue({ result, usage }),
      timeoutMs: 30_000,
    });

    const analyzed = await provider.analyze(request());
    expect(analyzed.usage).toMatchObject({
      cachedInputTokens: 20,
      inputTokens: 100,
      outputTokens: 40,
      reasoningTokens: 5,
      requestId: 'response-1',
    });
    expect(analyzed.usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects opportunities outside the source duration', async () => {
    const provider = new OpenAIContentIntelligenceProvider({
      apiKey: 'test-openai-key-not-a-secret',
      model: 'gpt-5.6-terra',
      request: vi.fn().mockResolvedValue({
        ...result,
        opportunities: [{ ...result.opportunities[0], endSeconds: 90 }],
      }),
      timeoutMs: 30_000,
    });

    await expect(provider.analyze(request())).rejects.toMatchObject({
      message:
        'The model returned content intelligence with invalid source evidence or timing.',
      retryable: true,
    });
  });

  it('treats malformed provider output as retryable', async () => {
    const provider = new OpenAIContentIntelligenceProvider({
      apiKey: 'test-openai-key-not-a-secret',
      model: 'gpt-5.6-terra',
      request: vi.fn().mockResolvedValue({ summary: 'Missing fields' }),
      timeoutMs: 30_000,
    });

    await expect(provider.analyze(request())).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('rejects evidence absent from the selected transcript range', async () => {
    const provider = new OpenAIContentIntelligenceProvider({
      apiKey: 'test-openai-key-not-a-secret',
      model: 'gpt-5.6-terra',
      request: vi.fn().mockResolvedValue({
        ...result,
        opportunities: [
          {
            ...result.opportunities[0],
            evidenceText: 'A sentence the speaker never said.',
          },
        ],
      }),
      timeoutMs: 30_000,
    });

    await expect(provider.analyze(request())).rejects.toMatchObject({
      message:
        'The model returned content intelligence with invalid source evidence or timing.',
      retryable: true,
    });
  });
});
