import type { PrismaClient } from '@clipgenius/database';
import type { ServerObjectReader } from '@clipgenius/storage';
import type { MediaProbeJobData } from '@clipgenius/types';
import type { VideoProbe } from '@clipgenius/video';
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

const { MediaProbeProcessor } =
  await import('../src/media/media-probe.processor.js');

const organizationId = '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29';
const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';
const mediaAssetId = 'c728fe4f-2b0d-4a28-8191-608c52e50d88';
const mediaJobId = '3f0c2b6e-1a58-4a4f-9d1b-6f2c0d5e7a11';

const metadata = {
  audioCodec: 'aac',
  bitRate: 2_500_000,
  durationSeconds: 92.457,
  frameRate: 29.97,
  hasAudio: true,
  height: 1080,
  videoCodec: 'h264',
  width: 1920,
};

function jobRecord(overrides: Record<string, unknown> = {}) {
  const { mediaAsset, ...rest } = overrides as {
    mediaAsset?: Record<string, unknown>;
  };
  return {
    attempts: 0,
    id: mediaJobId,
    mediaAsset: {
      contentType: 'video/mp4',
      id: mediaAssetId,
      sizeBytes: 1_024n,
      status: 'UPLOADED',
      storageKey: `organizations/${organizationId}/projects/${projectId}/source/${mediaAssetId}/source.mp4`,
      ...mediaAsset,
    },
    mediaAssetId,
    organizationId,
    projectId,
    status: 'QUEUED',
    type: 'MEDIA_PROBE',
    ...rest,
  };
}

function queuedJob(
  data: Partial<MediaProbeJobData> = {},
): Job<MediaProbeJobData> {
  return {
    data: { mediaAssetId, mediaJobId, organizationId, projectId, ...data },
  } as Job<MediaProbeJobData>;
}

describe('MediaProbeProcessor', () => {
  const findJob = vi.fn();
  const updateJob = vi.fn();
  const updateAsset = vi.fn();
  const transaction = vi.fn((operations: readonly unknown[]) =>
    Promise.all(operations),
  );
  const createSignedDownloadUrl = vi.fn();
  const probe = vi.fn();

  const database = {
    $transaction: transaction,
    mediaAsset: { update: updateAsset },
    mediaJob: { findUnique: findJob, update: updateJob },
  } as unknown as PrismaClient;
  const storage = { createSignedDownloadUrl } as unknown as ServerObjectReader;
  const videoProbe = { probe } as unknown as VideoProbe;

  function processor(attempts = 3) {
    return new MediaProbeProcessor(database, storage, videoProbe, {
      attempts,
      maxBytes: 50 * 1024 * 1024,
      signedUrlLifetimeSeconds: 3_600,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createSignedDownloadUrl.mockResolvedValue({
      expiresAt: new Date(),
      url: 'https://storage.example/signed',
    });
    downloadToTemporaryFile.mockResolvedValue({
      directory: '/tmp/clipgenius-media-test',
      path: '/tmp/clipgenius-media-test/source.mp4',
    });
    discardTemporaryMedia.mockResolvedValue(undefined);
    probe.mockResolvedValue(metadata);
    updateJob.mockResolvedValue(jobRecord());
    updateAsset.mockResolvedValue({});
  });

  it('records technical metadata and marks the job succeeded', async () => {
    findJob.mockResolvedValueOnce(jobRecord());

    await processor().process(queuedJob());

    expect(updateJob.mock.calls[0]?.[0]).toMatchObject({
      data: { attempts: 1, status: 'RUNNING' },
    });
    expect(updateAsset.mock.calls[0]?.[0]).toMatchObject({
      data: {
        durationSeconds: 92.457,
        hasAudio: true,
        height: 1080,
        videoCodec: 'h264',
        width: 1920,
      },
      where: { id: mediaAssetId },
    });
    expect(updateJob.mock.calls[1]?.[0]).toMatchObject({
      data: { status: 'SUCCEEDED' },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('always removes the temporary file after probing', async () => {
    findJob.mockResolvedValueOnce(jobRecord());
    probe.mockRejectedValueOnce(new Error('ffprobe exploded'));

    await expect(processor().process(queuedJob())).rejects.toThrow(
      'ffprobe exploded',
    );

    expect(discardTemporaryMedia).toHaveBeenCalledOnce();
  });

  it('skips a job whose media record no longer exists', async () => {
    findJob.mockResolvedValueOnce(null);

    await processor().process(queuedJob());

    expect(updateJob).not.toHaveBeenCalled();
    expect(downloadToTemporaryFile).not.toHaveBeenCalled();
  });

  it('does not redo work when a completed job is replayed', async () => {
    findJob.mockResolvedValueOnce(jobRecord({ status: 'SUCCEEDED' }));

    await processor().process(queuedJob());

    expect(downloadToTemporaryFile).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it('permanently rejects a payload that does not match the stored record', async () => {
    findJob.mockResolvedValueOnce(jobRecord());

    await expect(
      processor().process(
        queuedJob({ organizationId: 'aa4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29' }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(downloadToTemporaryFile).not.toHaveBeenCalled();
    expect(updateJob.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'FAILED' },
    });
  });

  it('permanently rejects media that was never verified as uploaded', async () => {
    findJob.mockResolvedValueOnce(
      jobRecord({ mediaAsset: { status: 'UPLOAD_PENDING' } }),
    );

    await expect(processor().process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(updateJob.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'FAILED' },
    });
  });

  it('permanently rejects media larger than the processing limit', async () => {
    findJob.mockResolvedValueOnce(
      jobRecord({ mediaAsset: { sizeBytes: 900n * 1024n * 1024n } }),
    );

    await expect(processor().process(queuedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('returns the job to the queue while retries remain', async () => {
    findJob.mockResolvedValueOnce(jobRecord());
    probe.mockRejectedValueOnce(new Error('storage hiccup'));

    await expect(processor(3).process(queuedJob())).rejects.toThrow(
      'storage hiccup',
    );

    expect(updateJob.mock.calls[1]?.[0]).toMatchObject({
      data: {
        attempts: 1,
        failureReason: 'storage hiccup',
        status: 'QUEUED',
      },
    });
  });

  it('marks the job failed once the retry budget is exhausted', async () => {
    findJob.mockResolvedValueOnce(jobRecord({ attempts: 2 }));
    probe.mockRejectedValueOnce(new Error('storage hiccup'));

    await expect(processor(3).process(queuedJob())).rejects.toThrow(
      'storage hiccup',
    );

    expect(updateJob.mock.calls[1]?.[0]).toMatchObject({
      data: { attempts: 3, status: 'FAILED' },
    });
  });
});
