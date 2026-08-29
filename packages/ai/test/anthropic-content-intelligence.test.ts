import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  AnthropicContentIntelligenceProvider,
  ContentIntelligenceProviderError,
} from '../src/index.js';

import type { ContentIntelligenceRequest } from '../src/index.js';

const request: ContentIntelligenceRequest = {
  diarized: true,
  durationSeconds: 65,
  language: 'en',
  project: { description: 'Sunday service clips', name: 'Sunday Service' },
  safetyIdentifier: 'organization-1',
  segments: [
    {
      endSeconds: 30,
      speaker: 'speaker_0',
      startSeconds: 0,
      text: 'Faith is not the absence of fear but the decision to move anyway.',
    },
    {
      endSeconds: 65,
      speaker: 'speaker_0',
      startSeconds: 30,
      text: 'That is what the cross teaches us about courage.',
    },
  ],
  speakerCount: 1,
  systemPrompt: 'Find content opportunities.',
};

const validResult = {
  keywords: ['faith'],
  opportunities: [
    {
      endSeconds: 30,
      evidenceText: 'Faith is not the absence of fear',
      hook: 'Faith is not the absence of fear',
      rationale: 'A self-contained definition with a clear turn.',
      recommendedDurationSeconds: 30,
      recommendedPlatforms: ['YOUTUBE'],
      scores: {
        clarity: 90,
        emotionalImpact: 80,
        hook: 85,
        platformFit: 75,
        retentionPotential: 70,
        standaloneValue: 88,
      },
      startSeconds: 0,
      summary: 'Defines faith as action despite fear.',
      title: 'Faith is a decision',
      topic: 'Faith',
      type: 'QUOTE',
    },
  ],
  summary: 'A short teaching on faith and courage.',
  topics: ['Faith'],
};

function provider(request_: ReturnType<typeof vi.fn>) {
  return new AnthropicContentIntelligenceProvider({
    apiKey: 'sk-ant-test-placeholder-not-used',
    model: 'claude-opus-5',
    request: request_ as never,
    timeoutMs: 300_000,
  });
}

describe('AnthropicContentIntelligenceProvider', () => {
  it('returns grounded opportunities tagged with the provider and model', async () => {
    const call = vi.fn().mockResolvedValue(validResult);

    const result = await provider(call).analyze(request);

    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-opus-5');
    expect(result.opportunities[0]?.title).toBe('Faith is a decision');
  });

  it('sends the transcript payload and the versioned system prompt', async () => {
    const call = vi.fn().mockResolvedValue(validResult);

    await provider(call).analyze(request);

    const [input, options] = call.mock.calls[0] as [
      { model: string; systemPrompt: string; userPrompt: string },
      { timeout: number },
    ];
    expect(input.model).toBe('claude-opus-5');
    expect(input.systemPrompt).toBe('Find content opportunities.');
    expect(JSON.parse(input.userPrompt)).toMatchObject({
      diarized: true,
      durationSeconds: 65,
      speakerCount: 1,
    });
    expect(options.timeout).toBe(300_000);
  });

  it('rejects an opportunity quoting text absent from its own time range', async () => {
    const call = vi.fn().mockResolvedValue({
      ...validResult,
      opportunities: [
        {
          ...validResult.opportunities[0],
          evidenceText: 'a sentence the speaker never said',
        },
      ],
    });

    await expect(provider(call).analyze(request)).rejects.toBeInstanceOf(
      ContentIntelligenceProviderError,
    );
  });

  it('treats an unparsable response as a retryable schema failure', async () => {
    const call = vi.fn().mockResolvedValue(null);

    await expect(provider(call).analyze(request)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('treats a depleted credit balance as terminal', async () => {
    const call = vi
      .fn()
      .mockRejectedValue(
        new Anthropic.APIError(
          400,
          { message: 'Your credit balance is too low to access the API' },
          'Your credit balance is too low to access the API',
          undefined,
        ),
      );

    await expect(provider(call).analyze(request)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('treats rate limiting and server faults as retryable', async () => {
    for (const status of [429, 500]) {
      const call = vi
        .fn()
        .mockRejectedValue(
          new Anthropic.APIError(
            status,
            { message: 'busy' },
            'busy',
            undefined,
          ),
        );

      await expect(provider(call).analyze(request)).rejects.toMatchObject({
        retryable: true,
      });
    }
  });

  it('does not retry a client error such as an unknown model', async () => {
    const call = vi
      .fn()
      .mockRejectedValue(
        new Anthropic.APIError(
          404,
          { message: 'model not found' },
          'model not found',
          undefined,
        ),
      );

    await expect(provider(call).analyze(request)).rejects.toMatchObject({
      retryable: false,
    });
  });
});
