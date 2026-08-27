import type { PrismaClient } from '@clipgenius/database';
import type { DirectUploadStorage } from '@clipgenius/storage';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

function mediaRecord(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'video/mp4',
    createdAt: new Date('2026-08-27T12:00:00.000Z'),
    failureReason: null,
    id: mediaId,
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
  const database = {
    mediaAsset: {
      create: createMedia,
      delete: deleteMedia,
      findFirst: findMedia,
      update: updateMedia,
    },
    organizationMembership: { findFirst: findMembership },
    project: { findFirst: findProject },
  } as unknown as PrismaClient;
  const storage = {
    createUploadTarget,
    getObjectInfo,
  } as unknown as DirectUploadStorage;
  const service = new MediaService(database, storage, {
    bucket: 'clipgenius-source-media',
    maxSourceVideoBytes: 50 * 1024 * 1024,
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
            'https://project.storage.supabase.co/storage/v1/upload/resumable',
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
});
