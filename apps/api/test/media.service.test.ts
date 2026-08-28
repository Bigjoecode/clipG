import type { PrismaClient } from '@clipgenius/database';
import type { DirectUploadStorage } from '@clipgenius/storage';
import type { MediaProbeJobData } from '@clipgenius/types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaService } from '../src/media/media.service.js';

const actor = {
  avatarUrl: null,
  displayName: 'Creator',
  email: 'creator@example.com',
  id: 'ff2b9fef-ec23-48f2-a7bd-8e9c75edbb44',
} as const;
const organizationId = '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29';
const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';
const mediaId = 'c728fe4f-2b0d-4a28-8191-608c52e50d88';
const mediaJobId = '3f0c2b6e-1a58-4a4f-9d1b-6f2c0d5e7a11';

function probeJob(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    createdAt: new Date('2026-08-27T12:05:00.000Z'),
    failureReason: null,
    finishedAt: null,
    id: mediaJobId,
    mediaAssetId: mediaId,
    organizationId,
    projectId,
    queuedAt: new Date('2026-08-27T12:05:00.000Z'),
    startedAt: null,
    status: 'QUEUED' as const,
    type: 'MEDIA_PROBE' as const,
    updatedAt: new Date('2026-08-27T12:05:00.000Z'),
    ...overrides,
  };
}

function mediaRecord(overrides: Record<string, unknown> = {}) {
  return {
    audioCodec: null,
    bitRate: null,
    contentType: 'video/mp4',
    createdAt: new Date('2026-08-27T12:00:00.000Z'),
    durationSeconds: null,
    failureReason: null,
    frameRate: null,
    hasAudio: null,
    height: null,
    id: mediaId,
    jobs: [],
    probedAt: null,
    videoCodec: null,
    width: null,
    kind: 'SOURCE_VIDEO' as const,
    organizationId,
    originalName: 'sermon.mp4',
    projectId,
    sizeBytes: 1_024n,
    status: 'UPLOAD_PENDING' as const,
    storageBucket: 'clipgenius-source-media',
    storageKey: `organizations/${organizationId}/projects/${projectId}/source/${mediaId}/source.mp4`,
    storageProvider: 'supabase',
    updatedAt: new Date('2026-08-27T12:00:00.000Z'),
    uploadedAt: null,
    uploadedById: actor.id,
    ...overrides,
  };
}

describe('MediaService', () => {
  const findMembership = vi.fn();
  const findProject = vi.fn();
  const createMedia = vi.fn();
  const deleteMedia = vi.fn();
  const findMedia = vi.fn();
  const updateMedia = vi.fn();
  const createUploadTarget = vi.fn();
  const getObjectInfo = vi.fn();
  const upsertJob = vi.fn();
  const updateJob = vi.fn();
  const addToQueue = vi.fn();
  const database = {
    mediaAsset: {
      create: createMedia,
      delete: deleteMedia,
      findFirst: findMedia,
      findMany: vi.fn(),
      update: updateMedia,
    },
    mediaJob: { update: updateJob, upsert: upsertJob },
    organizationMembership: { findFirst: findMembership },
    project: { findFirst: findProject },
  } as unknown as PrismaClient;
  const storage = {
    createUploadTarget,
    getObjectInfo,
  } as unknown as DirectUploadStorage;
  const probeQueue = { add: addToQueue } as unknown as Queue<MediaProbeJobData>;
  const service = new MediaService(
    database,
    storage,
    {
      bucket: 'clipgenius-source-media',
      maxSourceVideoBytes: 50 * 1024 * 1024,
    },
    probeQueue,
    { attempts: 3 },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    upsertJob.mockResolvedValue(probeJob());
    addToQueue.mockResolvedValue({ id: mediaJobId });
  });

  it('creates a tenant-scoped signed resumable upload session', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    createMedia.mockImplementationOnce(
      (input: { readonly data: Record<string, unknown> }) =>
        Promise.resolve(
          mediaRecord({
            id: input.data.id,
            storageKey: input.data.storageKey,
          }),
        ),
    );
    createUploadTarget.mockImplementationOnce(
      (input: { readonly key: string }) =>
        Promise.resolve({
          bucket: 'clipgenius-source-media',
          chunkSizeBytes: 6 * 1024 * 1024,
          endpoint:
            'https://project.storage.supabase.co/storage/v1/upload/resumable/sign',
          expiresAt: new Date('2026-08-27T14:00:00.000Z'),
          key: input.key,
          token: 'signed-token',
        }),
    );

    const result = await service.initiateSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      {
        contentType: 'video/mp4',
        fileName: 'sermon.mp4',
        sizeBytes: 1_024,
      },
    );

    expect(result.upload).toMatchObject({
      protocol: 'tus',
      token: 'signed-token',
    });
    expect(createMedia).toHaveBeenCalledOnce();
    expect(result.upload.key).toMatch(
      new RegExp(
        `^organizations/${organizationId}/projects/${projectId}/source/[0-9a-f-]+/source\\.mp4$`,
      ),
    );
  });

  it('does not reveal projects outside the actor organization', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce(null);

    await expect(
      service.list(actor, 'creator-studio', projectId),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects files larger than the configured source-video limit', async () => {
    await expect(
      service.initiateSourceVideoUpload(
        actor,
        'access-token',
        'creator-studio',
        projectId,
        {
          contentType: 'video/mp4',
          fileName: 'oversized.mp4',
          sizeBytes: 50 * 1024 * 1024 + 1,
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(findMembership).not.toHaveBeenCalled();
    expect(createMedia).not.toHaveBeenCalled();
  });

  it('rejects uploads to archived projects before creating media', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ARCHIVED',
    });

    await expect(
      service.initiateSourceVideoUpload(
        actor,
        'access-token',
        'creator-studio',
        projectId,
        {
          contentType: 'video/mp4',
          fileName: 'sermon.mp4',
          sizeBytes: 1_024,
        },
      ),
    ).rejects.toThrow(ConflictException);
    expect(createMedia).not.toHaveBeenCalled();
  });

  it('returns an already completed upload without touching storage again', async () => {
    const uploaded = mediaRecord({
      status: 'UPLOADED',
      uploadedAt: new Date('2026-08-27T12:05:00.000Z'),
    });
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(uploaded);

    const result = await service.completeSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(result.status).toBe('UPLOADED');
    expect(getObjectInfo).not.toHaveBeenCalled();
    expect(updateMedia).not.toHaveBeenCalled();
  });

  it('accepts an equivalent provider content type with parameters', async () => {
    const media = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(media);
    getObjectInfo.mockResolvedValueOnce({
      contentType: 'Video/MP4; charset=binary',
      sizeBytes: 1_024,
    });
    updateMedia.mockResolvedValueOnce(
      mediaRecord({
        status: 'UPLOADED',
        uploadedAt: new Date('2026-08-27T12:05:00.000Z'),
      }),
    );

    const result = await service.completeSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(result.status).toBe('UPLOADED');
    expect(updateMedia.mock.calls[0]?.[0]).toMatchObject({
      data: {
        failureReason: null,
        status: 'UPLOADED',
      },
      where: { id: mediaId },
    });
  });

  it('marks an upload failed when stored metadata does not match', async () => {
    const media = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(media);
    getObjectInfo.mockResolvedValueOnce({
      contentType: 'video/mp4',
      sizeBytes: 512,
    });
    updateMedia.mockResolvedValueOnce(mediaRecord({ status: 'FAILED' }));

    await expect(
      service.completeSourceVideoUpload(
        actor,
        'access-token',
        'creator-studio',
        projectId,
        mediaId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(updateMedia).toHaveBeenCalledWith({
      data: {
        failureReason: 'Stored object metadata did not match the upload.',
        status: 'FAILED',
      },
      where: { id: mediaId },
    });
  });

  it('queues an idempotent media probe once an upload is verified', async () => {
    const media = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(media);
    getObjectInfo.mockResolvedValueOnce({
      contentType: 'video/mp4',
      sizeBytes: 1_024,
    });
    updateMedia.mockResolvedValueOnce(
      mediaRecord({ status: 'UPLOADED', uploadedAt: new Date() }),
    );

    const result = await service.completeSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(upsertJob.mock.calls[0]?.[0]).toMatchObject({
      update: {},
      where: {
        mediaAssetId_type: { mediaAssetId: mediaId, type: 'MEDIA_PROBE' },
      },
    });
    expect(addToQueue).toHaveBeenCalledOnce();
    expect(addToQueue.mock.calls[0]?.[1]).toEqual({
      mediaAssetId: mediaId,
      mediaJobId,
      organizationId,
      projectId,
    });
    expect(addToQueue.mock.calls[0]?.[2]).toMatchObject({
      attempts: 3,
      jobId: mediaJobId,
    });
    expect(result.probe).toMatchObject({ id: mediaJobId, status: 'QUEUED' });
  });

  it('does not queue a second probe when one has already run', async () => {
    const media = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(media);
    getObjectInfo.mockResolvedValueOnce({
      contentType: 'video/mp4',
      sizeBytes: 1_024,
    });
    updateMedia.mockResolvedValueOnce(
      mediaRecord({ status: 'UPLOADED', uploadedAt: new Date() }),
    );
    upsertJob.mockResolvedValue(probeJob({ status: 'SUCCEEDED' }));

    await service.completeSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('keeps a verified upload when the queue is unreachable', async () => {
    const media = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(media);
    getObjectInfo.mockResolvedValueOnce({
      contentType: 'video/mp4',
      sizeBytes: 1_024,
    });
    updateMedia.mockResolvedValueOnce(
      mediaRecord({ status: 'UPLOADED', uploadedAt: new Date() }),
    );
    addToQueue.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    updateJob.mockResolvedValueOnce(
      probeJob({
        failureReason:
          'The processing queue was unreachable. Retry the analysis.',
        status: 'FAILED',
      }),
    );

    const result = await service.completeSourceVideoUpload(
      actor,
      'access-token',
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(result.status).toBe('UPLOADED');
    expect(result.probe).toMatchObject({ status: 'FAILED' });
  });

  it('re-queues a failed probe when analysis is requested again', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(
      mediaRecord({
        jobs: [probeJob({ status: 'FAILED' })],
        status: 'UPLOADED',
      }),
    );

    const result = await service.requestSourceVideoProbe(
      actor,
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(upsertJob.mock.calls[0]?.[0]).toMatchObject({
      update: { attempts: 0, failureReason: null, status: 'QUEUED' },
    });
    expect(addToQueue).toHaveBeenCalledOnce();
    expect(result.probe).toMatchObject({ status: 'QUEUED' });
  });

  it('ignores a repeated analysis request while a probe is running', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(
      mediaRecord({
        jobs: [probeJob({ status: 'RUNNING' })],
        status: 'UPLOADED',
      }),
    );

    const result = await service.requestSourceVideoProbe(
      actor,
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(upsertJob).not.toHaveBeenCalled();
    expect(addToQueue).not.toHaveBeenCalled();
    expect(result.probe).toMatchObject({ status: 'RUNNING' });
  });

  it('refuses analysis for media that never finished uploading', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(mediaRecord());

    await expect(
      service.requestSourceVideoProbe(
        actor,
        'creator-studio',
        projectId,
        mediaId,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('exposes technical metadata only after a probe has written it', async () => {
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(
      mediaRecord({
        durationSeconds: 92.457,
        hasAudio: true,
        height: 1080,
        jobs: [probeJob({ status: 'SUCCEEDED' })],
        probedAt: new Date('2026-08-27T12:06:00.000Z'),
        status: 'UPLOADED',
        videoCodec: 'h264',
        width: 1920,
      }),
    );

    const result = await service.requestSourceVideoProbe(
      actor,
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(result.metadata).toMatchObject({
      durationSeconds: 92.457,
      hasAudio: true,
      height: 1080,
      videoCodec: 'h264',
      width: 1920,
    });
  });

  it('marks a pending upload failed after browser retries are exhausted', async () => {
    const pending = mediaRecord();
    findMembership.mockResolvedValueOnce({ organizationId });
    findProject.mockResolvedValueOnce({
      id: projectId,
      organizationId,
      status: 'ACTIVE',
    });
    findMedia.mockResolvedValueOnce(pending);
    updateMedia.mockResolvedValueOnce(
      mediaRecord({
        failureReason: 'The browser upload exhausted its retry attempts.',
        status: 'FAILED',
      }),
    );

    const result = await service.failSourceVideoUpload(
      actor,
      'creator-studio',
      projectId,
      mediaId,
    );

    expect(result.status).toBe('FAILED');
    expect(updateMedia).toHaveBeenCalledWith({
      data: {
        failureReason: 'The browser upload exhausted its retry attempts.',
        status: 'FAILED',
      },
      where: { id: mediaId },
    });
  });
});
