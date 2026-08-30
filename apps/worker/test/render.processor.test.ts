import type { PrismaClient } from '@clipgenius/database';
import type {
  ServerObjectReader,
  ServerObjectWriter,
} from '@clipgenius/storage';
import type { RenderJobData } from '@clipgenius/types';
import { RenderError, type Renderer } from '@clipgenius/video';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RenderProcessor } from '../src/render/render.processor.js';

vi.mock('../src/media/media-download.js', () => ({
  discardTemporaryMedia: vi.fn().mockResolvedValue(undefined),
  downloadToTemporaryFile: vi.fn().mockResolvedValue({
    directory: 'C:\\temp\\download',
    path: 'C:\\temp\\download\\source.mp4',
  }),
}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const renderId = '44444444-4444-4444-8444-444444444444';

const plan = {
  id: '55555555-5555-4555-8555-555555555555',
  metadata: { createdBy: 'USER' },
  objective: 'Render a title',
  operations: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      target: { kind: 'TIME', range: { endMs: 2_000, startMs: 0 } },
      text: 'ClipGenius',
      type: 'TEXT',
    },
  ],
  output: { aspectRatio: '16:9' },
  platform: 'NONE',
  retention: 'KEEP_ALL_EXCEPT_REMOVED',
  schemaVersion: '1.0',
  source: {
    durationMs: 10_000,
    mediaAssetId: sourceId,
    source: 'SOURCE_MEDIA',
  },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    allowAiGeneratedAssets: false,
    assetManifest: [],
    attempts: 0,
    editPlan: plan,
    id: renderId,
    organizationId,
    projectId,
    sourceMedia: {
      durationSeconds: 10,
      hasAudio: true,
      sizeBytes: 1_000n,
      status: 'UPLOADED',
      storageBucket: 'clipgenius-source-media',
      storageKey: 'source/source.mp4',
    },
    sourceMediaAssetId: sourceId,
    status: 'QUEUED',
    ...overrides,
  };
}

function job(): Job<RenderJobData> {
  return {
    data: {
      organizationId,
      projectId,
      renderId,
      sourceMediaAssetId: sourceId,
    },
  } as Job<RenderJobData>;
}

describe('RenderProcessor', () => {
  const findUnique = vi.fn();
  const update = vi.fn<(input: unknown) => Promise<unknown>>();
  const createSignedDownloadUrl =
    vi.fn<ServerObjectReader['createSignedDownloadUrl']>();
  const putFile = vi.fn<ServerObjectWriter['putFile']>();
  const render = vi.fn<Renderer['render']>();
  let processor: RenderProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(record());
    update.mockResolvedValue({});
    createSignedDownloadUrl.mockResolvedValue({
      expiresAt: new Date(),
      url: 'https://storage.example/source',
    });
    putFile.mockResolvedValue({
      contentType: 'video/mp4',
      key: 'renders/output.mp4',
      sizeBytes: 2_000,
    });
    render.mockResolvedValue({
      backend: 'ffmpeg',
      media: {
        audioCodec: 'aac',
        container: 'mp4',
        durationMs: 10_000,
        height: 720,
        path: 'C:\\temp\\output.mp4',
        sizeBytes: 2_000,
        videoCodec: 'h264',
        width: 1280,
      },
      renderDurationMs: 5_000,
      status: 'SUCCEEDED',
      version: '1.0.0',
      warnings: [],
    });
    processor = new RenderProcessor(
      {
        render: { findUnique, update },
      } as unknown as PrismaClient,
      { createSignedDownloadUrl },
      { putFile },
      { render },
      {
        attempts: 2,
        maxInputBytes: 10_000,
        maxOutputBytes: 10_000,
        outputBucket: 'clipgenius-source-media',
        signedUrlLifetimeSeconds: 3_600,
      },
    );
  });

  it('renders, stores a separate output, and records observability metadata', async () => {
    await processor.process(job());
    expect(render).toHaveBeenCalledOnce();
    expect(putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `organizations/${organizationId}/projects/${projectId}/renders/${renderId}/output.mp4`,
      }),
    );
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({
      data: {
        backend: 'ffmpeg',
        outputDurationMs: 10_000,
        outputHeight: 720,
        outputWidth: 1280,
        renderDurationMs: 5_000,
        rendererVersion: '1.0.0',
        status: 'SUCCEEDED',
      },
      where: { id: renderId },
    });
  });

  it('does not rerender an already successful record', async () => {
    findUnique.mockResolvedValueOnce(record({ status: 'SUCCEEDED' }));
    await processor.process(job());
    expect(render).not.toHaveBeenCalled();
  });

  it('classifies an unsupported operation as a terminal render failure', async () => {
    render.mockRejectedValueOnce(
      new RenderError('UNSUPPORTED_OPERATION', 'KEEP is unsupported.'),
    );
    await expect(processor.process(job())).rejects.toThrow(
      'KEEP is unsupported.',
    );
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({
      data: {
        errorCategory: 'UNSUPPORTED_OPERATION',
        status: 'FAILED',
      },
      where: { id: renderId },
    });
  });

  it('leaves retryable renderer failures queued while attempts remain', async () => {
    render.mockRejectedValueOnce(
      new RenderError('RENDERER_FAILURE', 'temporary encoder failure', true),
    );
    await expect(processor.process(job())).rejects.toThrow(
      'temporary encoder failure',
    );
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({
      data: {
        errorCategory: 'RENDERER_FAILURE',
        status: 'QUEUED',
      },
      where: { id: renderId },
    });
  });
});
