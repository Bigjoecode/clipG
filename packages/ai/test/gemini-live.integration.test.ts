import { describe, expect, it } from 'vitest';

import { GeminiContentIntelligenceProvider } from '../src/index.js';

import type { ContentIntelligenceRequest } from '../src/index.js';

/**
 * Opt-in live integration test. It is skipped unless BOTH are set:
 *
 *   CLIPGENIUS_LIVE_GEMINI=1
 *   GEMINI_API_KEY=<key>
 *
 * Run it with:
 *
 *   CLIPGENIUS_LIVE_GEMINI=1 corepack pnpm --filter @clipgenius/ai test
 *
 * It never runs in CI or in `pnpm validate`, so the normal suite needs no key
 * and costs nothing. It exists because the failure this guards against — the
 * Interactions API rejecting our schema — is invisible to a mocked test: every
 * mocked test passed while the live call returned 400.
 *
 * The fixture is deliberately tiny to stay inside the free tier.
 */
const live =
  process.env.CLIPGENIUS_LIVE_GEMINI === '1' &&
  typeof process.env.GEMINI_API_KEY === 'string';

const request: ContentIntelligenceRequest = {
  diarized: true,
  durationSeconds: 40,
  language: 'en',
  project: { description: 'Small deterministic fixture', name: 'Live check' },
  safetyIdentifier: 'live-integration-test',
  segments: [
    {
      endSeconds: 20,
      speaker: 'speaker_0',
      startSeconds: 0,
      text: 'Preparation is what turns a good idea into a finished product. Most people stop at the idea.',
    },
    {
      endSeconds: 40,
      speaker: 'speaker_0',
      startSeconds: 20,
      text: 'So the question is not whether you have ideas. The question is what you finish.',
    },
  ],
  speakerCount: 1,
  systemPrompt:
    'You analyze transcripts and return content opportunities. evidenceText must be quoted verbatim from the segments inside the opportunity time range. Return at most 3 opportunities.',
};

describe.skipIf(!live)('Gemini live integration', () => {
  it(
    'completes a real structured request and normalizes it into the domain',
    { timeout: 180_000 },
    async () => {
      const provider = new GeminiContentIntelligenceProvider({
        apiKey: process.env.GEMINI_API_KEY ?? '',
        model: process.env.CLIPGENIUS_LIVE_GEMINI_MODEL ?? 'gemini-3.6-flash',
        timeoutMs: 180_000,
      });

      const result = await provider.analyze(request);

      expect(result.provider).toBe('gemini');
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.opportunities.length).toBeGreaterThan(0);

      // Usage must reach the ledger, including the provider request id.
      expect(result.usage.requestId).toBeTruthy();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);

      for (const opportunity of result.opportunities) {
        expect(opportunity.endSeconds).toBeLessThanOrEqual(
          request.durationSeconds + 0.25,
        );
        expect(opportunity.startSeconds).toBeLessThan(opportunity.endSeconds);
        // Grounding: evidence must appear in the transcript it claims to quote.
        const spoken = request.segments
          .map((segment) => segment.text)
          .join(' ')
          .toLowerCase();
        expect(spoken).toContain(opportunity.evidenceText.toLowerCase().trim());
      }
    },
  );
});
