import type { PrismaClient } from '@clipgenius/database';
import type { Queue } from 'bullmq';
import type { RenderJobData } from '@clipgenius/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RenderJobService,
  type CreateRenderJobInput,
} from '../src/render/render-job.service.js';

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

describe('RenderJobService', () => {
  const findFirst = vi.fn<(input: unknown) => Promise<unknown>>();
  const upsert = vi.fn<
    (input: { create: { idempotencyKey: string } }) => Promise<{
      id: string;
      organizationId: string;
      projectId: string;
      sourceMediaAssetId: string;
      status: 'QUEUED' | 'SUCCEEDED';
    }>
  >();
  const add = vi.fn<Queue<RenderJobData>['add']>();
  let service: RenderJobService;

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({
      durationSeconds: 10,
      hasAudio: true,
      id: sourceId,
      project: { status: 'ACTIVE' },
      status: 'UPLOADED',
    });
    upsert.mockResolvedValue({
      id: renderId,
      organizationId,
      projectId,
      sourceMediaAssetId: sourceId,
      status: 'QUEUED',
    });
    const database = {
      mediaAsset: { findFirst },
      render: { upsert },
    } as unknown as PrismaClient;
    service = new RenderJobService(database, {
      add,
    } as unknown as Queue<RenderJobData>);
  });

  it('creates a validated render intent and queues identifiers only', async () => {
    await service.create({
      assetManifest: [],
      editPlan: plan,
      organizationId,
      projectId,
      sourceMediaAssetId: sourceId,
    });
    expect(upsert.mock.calls[0]?.[0].create.idempotencyKey).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(add).toHaveBeenCalledWith(
      'render',
      { organizationId, projectId, renderId, sourceMediaAssetId: sourceId },
      expect.objectContaining({ jobId: renderId }),
    );
  });

  it('uses the same database and BullMQ idempotency keys for repeated input', async () => {
    const input: CreateRenderJobInput = {
      assetManifest: [],
      editPlan: plan,
      organizationId,
      projectId,
      sourceMediaAssetId: sourceId,
    };
    await service.create(input);
    await service.create(input);
    const first = upsert.mock.calls[0]?.[0].create.idempotencyKey;
    const second = upsert.mock.calls[1]?.[0].create.idempotencyKey;
    expect(first).toBe(second);
    expect(add.mock.calls.map((call) => call[2]?.jobId)).toEqual([
      renderId,
      renderId,
    ]);
  });

  it('does not enqueue an already completed render', async () => {
    upsert.mockResolvedValueOnce({
      id: renderId,
      organizationId,
      projectId,
      sourceMediaAssetId: sourceId,
      status: 'SUCCEEDED',
    });
    await service.create({
      assetManifest: [],
      editPlan: plan,
      organizationId,
      projectId,
      sourceMediaAssetId: sourceId,
    });
    expect(add).not.toHaveBeenCalled();
  });

  it('rejects an unvalidated plan before persistence', async () => {
    await expect(
      service.create({
        assetManifest: [],
        editPlan: {},
        organizationId,
        projectId,
        sourceMediaAssetId: sourceId,
      }),
    ).rejects.toMatchObject({ category: 'INVALID_EDIT_PLAN' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
