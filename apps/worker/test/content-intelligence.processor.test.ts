import type { ContentIntelligenceProvider } from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';
import type { ContentIntelligenceJobData } from '@clipgenius/types';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentIntelligenceProcessor } from '../src/content-intelligence/content-intelligence.processor.js';

const organizationId = '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29';
const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';
const mediaAssetId = 'c728fe4f-2b0d-4a28-8191-608c52e50d88';
const mediaJobId = '3f0c2b6e-1a58-4a4f-9d1b-6f2c0d5e7a11';
const transcriptUpdatedAt = new Date('2026-08-28T12:00:00.000Z');

function jobRecord(transcript: Record<string, unknown> | null = {}) {
  return {
    attempts: 0,
    id: mediaJobId,
    mediaAsset: {
      durationSeconds: 65,
      id: mediaAssetId,
      organizationId,
      project: { description: 'Sunday clips', name: 'Sunday Service' },
      projectId,
      status: 'UPLOADED',
      transcript:
        transcript === null
          ? null
          : {
              diarized: true,
              durationSeconds: 65,
              id: '82c63e3b-97f4-4ab0-9c16-1b93a7798080',
              language: 'en',
              segments: [
                {
                  endSeconds: 42,
                  speaker: 'speaker_0',
                  startSeconds: 20,
                  text: 'Forgiveness is freedom from carrying yesterday.',
                },
              ],
              speakerCount: 1,
              updatedAt: transcriptUpdatedAt,
              ...transcript,
            },
    },
    mediaAssetId,
    organizationId,
    projectId,
    status: 'QUEUED',
    type: 'CONTENT_INTELLIGENCE',
  };
}

function queuedJob(): Job<ContentIntelligenceJobData> {
  return {
    data: { mediaAssetId, mediaJobId, organizationId, projectId },
  } as Job<ContentIntelligenceJobData>;
}

describe('ContentIntelligenceProcessor', () => {
  const findJob = vi.fn();
  const updateJob = vi.fn();
  const findAnalysis = vi.fn();
  const upsertAnalysis = vi.fn();
  const deleteOpportunities = vi.fn();
  const createOpportunities = vi.fn();
  const transaction = vi.fn((operations: readonly unknown[]) =>
    Promise.all(operations),
  );
  const analyze = vi.fn();
  const database = {
    $transaction: transaction,
    contentAnalysis: { findUnique: findAnalysis, upsert: upsertAnalysis },
    contentOpportunity: {
      createMany: createOpportunities,
      deleteMany: deleteOpportunities,
    },
    mediaJob: { findUnique: findJob, update: updateJob },
  } as unknown as PrismaClient;
  const provider = { analyze } as unknown as ContentIntelligenceProvider;

  function processor(maxTranscriptCharacters = 200_000) {
    return new ContentIntelligenceProcessor(database, provider, {
      attempts: 3,
      maxTranscriptCharacters,
      promptId: 'content-intelligence',
      promptVersion: 1,
      systemPrompt: 'Analyze only supplied evidence.',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    findJob.mockResolvedValue(jobRecord());
    updateJob.mockResolvedValue({});
    findAnalysis.mockResolvedValue(null);
    upsertAnalysis.mockResolvedValue({});
    deleteOpportunities.mockResolvedValue({ count: 0 });
    createOpportunities.mockResolvedValue({ count: 1 });
    analyze.mockResolvedValue({
      keywords: ['forgiveness'],
      model: 'gpt-5.6-terra',
      opportunities: [
        {
          endSeconds: 42,
          evidenceText: 'Forgiveness is freedom from carrying yesterday.',
          hook: 'What if forgiveness is freedom?',
          rationale: 'A complete insight.',
          recommendedDurationSeconds: 22,
          recommendedPlatforms: ['YOUTUBE', 'INSTAGRAM'],
          scores: {
            clarity: 90,
            emotionalImpact: 88,
            hook: 91,
            platformFit: 89,
            retentionPotential: 90,
            standaloneValue: 94,
          },
          startSeconds: 20,
          summary: 'Forgiveness reframed as freedom.',
          title: 'Forgiveness Is Freedom',
          topic: 'Forgiveness',
          type: 'INSIGHT',
        },
      ],
      provider: 'openai',
      summary: 'A sermon about forgiveness.',
      topics: ['Forgiveness'],
    });
  });

  it('persists validated opportunities and the exact transcript revision', async () => {
    await processor().process(queuedJob());

    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        diarized: true,
        speakerCount: 1,
        systemPrompt: 'Analyze only supplied evidence.',
      }),
    );
    expect(upsertAnalysis.mock.calls[0]?.[0]).toHaveProperty(
      'create.transcriptUpdatedAt',
      transcriptUpdatedAt,
    );
    expect(upsertAnalysis.mock.calls[0]?.[0]).toHaveProperty(
      'create.promptVersion',
      1,
    );
    expect(createOpportunities.mock.calls[0]?.[0]).toHaveProperty(
      'data.0.type',
      'INSIGHT',
    );
    expect(updateJob.mock.calls.at(-1)?.[0]).toHaveProperty(
      'data.status',
      'SUCCEEDED',
    );
  });

  it('fails permanently when no transcript exists', async () => {
    findJob.mockResolvedValue(jobRecord(null));

    await expect(processor().process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(analyze).not.toHaveBeenCalled();
    expect(updateJob.mock.calls.at(-1)?.[0]).toHaveProperty(
      'data.status',
      'FAILED',
    );
  });

  it('rejects transcripts above the configured character limit', async () => {
    await expect(processor(10).process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(analyze).not.toHaveBeenCalled();
  });
});
