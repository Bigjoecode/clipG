import { randomUUID } from 'node:crypto';

import {
  type MediaAsset as DatabaseMediaAsset,
  type MediaKind as DatabaseMediaKind,
  type MediaStatus as DatabaseMediaStatus,
  type PrismaClient,
} from '@clipgenius/database';
import type { DirectUploadStorage } from '@clipgenius/storage';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DATABASE_CLIENT } from '../database/database.module.js';
import { normalizeOrganizationSlug } from '../organizations/organizations.service.js';
import { DIRECT_UPLOAD_STORAGE } from '../storage/storage.module.js';

import type { InitiateSourceVideoUploadInput } from './media.schemas.js';
import type {
  AuthenticatedUser,
  MediaAssetSummary,
  MediaKind,
  MediaStatus,
  SourceVideoUploadSession,
} from '@clipgenius/types';

export interface MediaUploadConfiguration {
  readonly bucket: string;
  readonly maxSourceVideoBytes: number;
}

export const MEDIA_UPLOAD_CONFIGURATION = Symbol('MEDIA_UPLOAD_CONFIGURATION');

const extensionByContentType = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
} as const;

function asMediaKind(kind: DatabaseMediaKind): MediaKind {
  return kind;
}

function asMediaStatus(status: DatabaseMediaStatus): MediaStatus {
  return status;
}

function normalizedContentType(contentType: string | null): string | null {
  if (contentType === null) {
    return null;
  }
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? null;
}

@Injectable()
export class MediaService {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DIRECT_UPLOAD_STORAGE)
    private readonly storage: DirectUploadStorage,
    @Inject(MEDIA_UPLOAD_CONFIGURATION)
    private readonly configuration: MediaUploadConfiguration,
  ) {}

  public async initiateSourceVideoUpload(
    actor: AuthenticatedUser,
    accessToken: string,
    organizationSlug: string,
    projectId: string,
    input: InitiateSourceVideoUploadInput,
  ): Promise<SourceVideoUploadSession> {
    if (input.sizeBytes > this.configuration.maxSourceVideoBytes) {
      throw new BadRequestException(
        `Video exceeds the ${this.configuration.maxSourceVideoBytes} byte upload limit.`,
      );
    }
    const project = await this.accessibleProject(
      actor.id,
      organizationSlug,
      projectId,
    );
    if (project.status !== 'ACTIVE') {
      throw new ConflictException(
        'Restore this project before uploading source media.',
      );
    }
    const mediaId = randomUUID();
    const extension = extensionByContentType[input.contentType];
    const storageKey = `organizations/${project.organizationId}/projects/${project.id}/source/${mediaId}/source.${extension}`;
    const media = await this.database.mediaAsset.create({
      data: {
        contentType: input.contentType,
        id: mediaId,
        kind: 'SOURCE_VIDEO',
        organizationId: project.organizationId,
        originalName: input.fileName,
        projectId: project.id,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'UPLOAD_PENDING',
        storageBucket: this.configuration.bucket,
        storageKey,
        storageProvider: 'supabase',
        uploadedById: actor.id,
      },
    });

    try {
      const target = await this.storage.createUploadTarget({
        accessToken,
        contentType: input.contentType,
        key: storageKey,
      });
      return {
        media: this.toSummary(media),
        upload: {
          bucket: target.bucket,
          chunkSizeBytes: target.chunkSizeBytes,
          endpoint: target.endpoint,
          expiresAt: target.expiresAt.toISOString(),
          key: target.key,
          protocol: 'tus',
          token: target.token,
        },
      };
    } catch {
      await this.database.mediaAsset.delete({ where: { id: media.id } });
      throw new ServiceUnavailableException(
        'Storage is temporarily unavailable. Please retry the upload.',
      );
    }
  }

  public async list(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
  ): Promise<readonly MediaAssetSummary[]> {
    const project = await this.accessibleProject(
      actor.id,
      organizationSlug,
      projectId,
    );
    const media = await this.database.mediaAsset.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId: project.organizationId,
        projectId: project.id,
      },
    });
    return media.map((asset) => this.toSummary(asset));
  }

  public async completeSourceVideoUpload(
    actor: AuthenticatedUser,
    accessToken: string,
    organizationSlug: string,
    projectId: string,
    mediaId: string,
  ): Promise<MediaAssetSummary> {
    const media = await this.accessibleMedia(
      actor.id,
      organizationSlug,
      projectId,
      mediaId,
    );
    if (media.status === 'UPLOADED') {
      return this.toSummary(media);
    }
    if (media.status === 'FAILED') {
      throw new ConflictException('This upload has already failed.');
    }

    let objectInfo;
    try {
      objectInfo = await this.storage.getObjectInfo(
        accessToken,
        media.storageKey,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Storage verification is temporarily unavailable. Please retry.',
      );
    }
    if (objectInfo === null) {
      throw new ConflictException(
        'The upload has not finished reaching storage.',
      );
    }
    const expectedSize = Number(media.sizeBytes);
    if (
      objectInfo.sizeBytes !== expectedSize ||
      normalizedContentType(objectInfo.contentType) !==
        normalizedContentType(media.contentType)
    ) {
      await this.database.mediaAsset.update({
        data: {
          failureReason: 'Stored object metadata did not match the upload.',
          status: 'FAILED',
        },
        where: { id: media.id },
      });
      throw new BadRequestException(
        'The uploaded video did not match the expected file metadata.',
      );
    }

    const updated = await this.database.mediaAsset.update({
      data: {
        failureReason: null,
        status: 'UPLOADED',
        uploadedAt: new Date(),
      },
      where: { id: media.id },
    });
    return this.toSummary(updated);
  }

  public async failSourceVideoUpload(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
    mediaId: string,
  ): Promise<MediaAssetSummary> {
    const media = await this.accessibleMedia(
      actor.id,
      organizationSlug,
      projectId,
      mediaId,
    );
    if (media.status !== 'UPLOAD_PENDING') {
      return this.toSummary(media);
    }
    const updated = await this.database.mediaAsset.update({
      data: {
        failureReason: 'The browser upload exhausted its retry attempts.',
        status: 'FAILED',
      },
      where: { id: media.id },
    });
    return this.toSummary(updated);
  }

  private async accessibleProject(
    userId: string,
    organizationSlug: string,
    projectId: string,
  ) {
    this.assertUuid(projectId, 'Project id');
    const membership = await this.database.organizationMembership.findFirst({
      where: {
        organization: {
          slug: normalizeOrganizationSlug(organizationSlug),
        },
        userId,
      },
    });
    if (membership === null) {
      throw new NotFoundException('Organization not found.');
    }
    const project = await this.database.project.findFirst({
      select: { id: true, organizationId: true, status: true },
      where: { id: projectId, organizationId: membership.organizationId },
    });
    if (project === null) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  private async accessibleMedia(
    userId: string,
    organizationSlug: string,
    projectId: string,
    mediaId: string,
  ): Promise<DatabaseMediaAsset> {
    this.assertUuid(mediaId, 'Media id');
    const project = await this.accessibleProject(
      userId,
      organizationSlug,
      projectId,
    );
    const media = await this.database.mediaAsset.findFirst({
      where: {
        id: mediaId,
        organizationId: project.organizationId,
        projectId: project.id,
      },
    });
    if (media === null) {
      throw new NotFoundException('Media asset not found.');
    }
    return media;
  }

  private assertUuid(value: string, field: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(`${field} must be a UUID.`);
    }
  }

  private toSummary(media: DatabaseMediaAsset): MediaAssetSummary {
    const sizeBytes = Number(media.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes)) {
      throw new Error('Media size exceeds the supported numeric range.');
    }
    return {
      contentType: media.contentType,
      createdAt: media.createdAt.toISOString(),
      id: media.id,
      kind: asMediaKind(media.kind),
      organizationId: media.organizationId,
      originalName: media.originalName,
      projectId: media.projectId,
      sizeBytes,
      status: asMediaStatus(media.status),
      updatedAt: media.updatedAt.toISOString(),
      uploadedAt: media.uploadedAt?.toISOString() ?? null,
      uploadedById: media.uploadedById,
    };
  }
}
