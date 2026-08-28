import { join } from 'node:path';

import { TranscriptionProviderError } from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';
import type { ServerObjectReader } from '@clipgenius/storage';
import type { TranscriptionJobData } from '@clipgenius/types';
import type { AudioExtractor } from '@clipgenius/video';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadToTemporaryFile = vi.fn();
const discardTemporaryMedia = vi.fn();

vi.mock('../src/media/media-download.js', () => ({
  discardTemporaryMedia: (...args: unknown[]) =>
    discardTemporaryMedia(...args) as unknown,
  downloadToTemporaryFile: (...args: unknown[]) =>
    downloadToTemporaryFile(...args) as unknown,
}));

const { TranscriptionProcessor } =
  await import('../src/transcription/transcription.processor.js');

const organizationId = '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29';
const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';
const mediaAssetId = 'c728fe4f-2b0d-4a28-8191-608c52e50d88';
const mediaJobId = '3f0c2b6e-1a58-4a4f-9d1b-6f2c0d5e7a11';

function jobRecord(overrides: Record<string, unknown> = {}) {
  const { mediaAsset, ...rest } = overrides as {
    mediaAsset?: Record<string, unknown>;
  };
  return {
    attempts: 0,
    id: mediaJobId,
    mediaAsset: {
      contentType: 'video/mp4',
      hasAudio: true,
      id: mediaAssetId,
      organizationId,
      probedAt: new Date(),
      projectId,
      sizeBytes: 1_024n,
      status: 'UPLOADED',
      storageKey: `organizations/${organizationId}/projects/${projectId}/source/${mediaAssetId}/source.mp4`,
      ...mediaAsset,
    },
    mediaAssetId,
    organizationId,
    projectId,
    status: 'QUEUED',
    type: 'TRANSCRIPTION',
    ...rest,
  };
}

function queuedJob(
  data: Partial<TranscriptionJobData> = {},
): Job<TranscriptionJobData> {
  return {
    data: { mediaAssetId, mediaJobId, organizationId, projectId, ...data },
  } as Job<TranscriptionJobData>;
}

describe('TranscriptionProcessor', () => {
  const findJob = vi.fn();
  const updateJob = vi.fn();
  const findTranscript = vi.fn();
  const upsertTranscript = vi.fn();
  const deleteSegments = vi.fn();
  const createSegments = vi.fn();
  const transaction = vi.fn((operations: readonly unknown[]) =>
    Promise.all(operations),
  );
  const createSignedDownloadUrl = vi.fn();
  const extract = vi.fn();
  const transcribe = vi.fn();

  const database = {
    $transaction: transaction,
    mediaJob: { findUnique: findJob, update: updateJob },
    transcript: { findUnique: findTranscript, upsert: upsertTranscript },
    transcriptSegment: {
      createMany: createSegments,
      deleteMany: deleteSegments,
    },
  } as unknown as PrismaClient;
  const storage = { createSignedDownloadUrl } as unknown as ServerObjectReader;
  const extractor = { extract } as unknown as AudioExtractor;
  const provider = { transcribe };

  function processor(attempts = 3) {
    return new TranscriptionProcessor(database, storage, extractor, provider, {
      attempts,
      maxAudioBytes: 25 * 1024 * 1024,
      maxSourceBytes: 50 * 1024 * 1024,
      signedUrlLifetimeSeconds: 3_600,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    findJob.mockResolvedValue(jobRecord());
    updateJob.mockResolvedValue(jobRecord());
    findTranscript.mockResolvedValue(null);
    upsertTranscript.mockResolvedValue({});
    deleteSegments.mockResolvedValue({ count: 0 });
    createSegments.mockResolvedValue({ count: 1 });
    createSignedDownloadUrl.mockResolvedValue({
      expiresAt: new Date(),
      url: 'https://storage.example/signed',
    });
    downloadToTemporaryFile.mockResolvedValue({
      directory: 'C:/temp/clipgenius-transcription',
      path: 'C:/temp/clipgenius-transcription/source.mp4',
    });
    extract.mockResolvedValue({
      path: 'C:/temp/clipgenius-transcription/speech.mp3',
      sizeBytes: 512,
    });
    transcribe.mockResolvedValue({
      durationSeconds: 65,
      language: null,
      model: 'gpt-4o-transcribe-diarize',
      provider: 'openai',
      segments: [
        {
          endSeconds: 4,
          speaker: 'A',
          startSeconds: 0,
          text: 'Welcome everyone.',
        },
      ],
      text: 'Welcome everyone.',
    });
    discardTemporaryMedia.mockResolvedValue(undefined);
  });

  it('extracts audio and atomically stores transcript segments', async () => {
    await processor().process(queuedJob());

    expect(extract).toHaveBeenCalledWith({
      outputPath: join('C:/temp/clipgenius-transcription', 'speech.mp3'),
      sourcePath: 'C:/temp/clipgenius-transcription/source.mp4',
    });
    expect(transcribe).toHaveBeenCalledWith({
      mediaUri: 'C:/temp/clipgenius-transcription/speech.mp3',
    });
    expect(upsertTranscript.mock.calls[0]?.[0]).toMatchObject({
      create: {
        mediaAssetId,
        model: 'gpt-4o-transcribe-diarize',
        provider: 'openai',
      },
    });
    expect(createSegments.mock.calls[0]?.[0]).toMatchObject({
      data: [
        {
          endSeconds: 4,
          index: 0,
          speaker: 'A',
          startSeconds: 0,
          text: 'Welcome everyone.',
        },
      ],
    });
    expect(updateJob.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { status: 'SUCCEEDED' },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(discardTemporaryMedia).toHaveBeenCalledOnce();
  });

  it('permanently rejects a video with no audio stream', async () => {
    findJob.mockResolvedValueOnce(
      jobRecord({ mediaAsset: { hasAudio: false } }),
    );

    await expect(processor().process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(extract).not.toHaveBeenCalled();
    expect(updateJob.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'FAILED' },
    });
  });

  it('returns a retryable provider failure to the queue', async () => {
    transcribe.mockRejectedValueOnce(
      new TranscriptionProviderError('OpenAI is busy.', true),
    );

    await expect(processor().process(queuedJob())).rejects.toThrow(
      'OpenAI is busy.',
    );
    expect(updateJob.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { attempts: 1, status: 'QUEUED' },
    });
    expect(discardTemporaryMedia).toHaveBeenCalledOnce();
  });

  it('marks a non-retryable provider rejection permanently failed', async () => {
    transcribe.mockRejectedValueOnce(
      new TranscriptionProviderError('The API key is invalid.', false),
    );

    await expect(processor().process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(updateJob.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { status: 'FAILED' },
    });
  });
});
