import { randomUUID } from 'node:crypto';

import {
  type MediaAsset as DatabaseMediaAsset,
  type MediaJob as DatabaseMediaJob,
  type MediaJobStatus as DatabaseMediaJobStatus,
  type MediaJobType as DatabaseMediaJobType,
  type MediaKind as DatabaseMediaKind,
  type MediaStatus as DatabaseMediaStatus,
  type PrismaClient,
  type Transcript as DatabaseTranscript,
} from '@clipgenius/database';
import type { DirectUploadStorage } from '@clipgenius/storage';
import { mediaProbeQueueName, transcriptionQueueName } from '@clipgenius/types';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';
import { normalizeOrganizationSlug } from '../organizations/organizations.service.js';
import { DIRECT_UPLOAD_STORAGE } from '../storage/storage.module.js';

import type {
  InitiateSourceVideoUploadInput,
  RequestTranscriptionInput,
} from './media.schemas.js';
import type {
  AuthenticatedUser,
  MediaAssetSummary,
  MediaJobStatus,
  MediaJobSummary,
  MediaJobType,
  MediaKind,
  MediaProbeJobData,
  MediaStatus,
  MediaTechnicalMetadata,
  SourceVideoUploadSession,
  TranscriptDetail,
  TranscriptSummary,
  TranscriptionJobData,
} from '@clipgenius/types';

export interface MediaUploadConfiguration {
  readonly bucket: string;
  readonly maxSourceVideoBytes: number;
}

export interface MediaProbeConfiguration {
  readonly attempts: number;
}

export interface TranscriptionConfiguration {
  readonly attempts: number;
}

export const MEDIA_UPLOAD_CONFIGURATION = Symbol('MEDIA_UPLOAD_CONFIGURATION');
export const MEDIA_PROBE_CONFIGURATION = Symbol('MEDIA_PROBE_CONFIGURATION');
export const TRANSCRIPTION_CONFIGURATION = Symbol(
  'TRANSCRIPTION_CONFIGURATION',
);

type MediaAssetWithJobs = DatabaseMediaAsset & {
  readonly jobs?: readonly DatabaseMediaJob[];
  readonly transcript?: TranscriptWithCount | null;
};

type TranscriptWithCount = DatabaseTranscript & {
  readonly _count: { readonly segments: number };
};

function probeJobOf(
  jobs: readonly DatabaseMediaJob[] | undefined,
): DatabaseMediaJob | undefined {
  return jobs?.find((job) => job.type === 'MEDIA_PROBE');
}

function transcriptionJobOf(
  jobs: readonly DatabaseMediaJob[] | undefined,
): DatabaseMediaJob | undefined {
  return jobs?.find((job) => job.type === 'TRANSCRIPTION');
}

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

function asMediaJobType(type: DatabaseMediaJobType): MediaJobType {
  return type;
}

function asMediaJobStatus(status: DatabaseMediaJobStatus): MediaJobStatus {
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
  private readonly logger = new Logger(MediaService.name);

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(DIRECT_UPLOAD_STORAGE)
    private readonly storage: DirectUploadStorage,
    @Inject(MEDIA_UPLOAD_CONFIGURATION)
    private readonly configuration: MediaUploadConfiguration,
    @InjectQueue(mediaProbeQueueName)
    private readonly probeQueue: Queue<MediaProbeJobData>,
    @Inject(MEDIA_PROBE_CONFIGURATION)
    private readonly probeConfiguration: MediaProbeConfiguration,
    @InjectQueue(transcriptionQueueName)
    private readonly transcriptionQueue: Queue<TranscriptionJobData>,
    @Inject(TRANSCRIPTION_CONFIGURATION)
    private readonly transcriptionConfiguration: TranscriptionConfiguration,
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
      include: {
        jobs: true,
        transcript: { include: { _count: { select: { segments: true } } } },
      },
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
    const probe = await this.queueMediaProbe(updated, { restart: false });
    return this.toSummary(updated, [probe]);
  }

  /**
   * Re-queues analysis for a source video whose probe failed. Queueing is
   * otherwise driven by upload completion, so this exists purely to make the
   * failure path recoverable without a second upload.
   */
  public async requestSourceVideoProbe(
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
    if (media.status !== 'UPLOADED') {
      throw new ConflictException(
        'Only a verified upload can be analyzed again.',
      );
    }
    const existing = probeJobOf(media.jobs);
    if (existing !== undefined && existing.status !== 'FAILED') {
      return this.toSummary(media, [existing]);
    }
    const probe = await this.queueMediaProbe(media, { restart: true });
    return this.toSummary(media, [probe]);
  }

  public async requestTranscription(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
    mediaId: string,
    input: RequestTranscriptionInput = { replaceExisting: false },
  ): Promise<MediaAssetSummary> {
    const media = await this.accessibleMedia(
      actor.id,
      organizationSlug,
      projectId,
      mediaId,
    );
    if (media.status !== 'UPLOADED') {
      throw new ConflictException(
        'Only a verified source video can be transcribed.',
      );
    }
    const probe = probeJobOf(media.jobs);
    if (probe?.status !== 'SUCCEEDED' || media.probedAt === null) {
      throw new ConflictException(
        'Analyze this video before starting transcription.',
      );
    }
    if (media.hasAudio !== true) {
      throw new ConflictException('This video has no audio to transcribe.');
    }
    const existing = transcriptionJobOf(media.jobs);
    if (existing !== undefined && existing.status !== 'FAILED') {
      // Work already in flight is never disturbed. A succeeded transcript is
      // only re-derived when the caller explicitly asks, which is what makes a
      // provider change reversible: the source media is immutable, so
      // re-transcribing is always safe, just not free.
      const inFlight =
        existing.status === 'QUEUED' || existing.status === 'RUNNING';
      if (inFlight || !input.replaceExisting) {
        return this.toSummary(media);
      }
    }
    await this.queueTranscription(media, { restart: existing !== undefined });
    const refreshed = await this.accessibleMedia(
      actor.id,
      organizationSlug,
      projectId,
      mediaId,
    );
    return this.toSummary(refreshed);
  }

  public async getTranscript(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
    mediaId: string,
  ): Promise<TranscriptDetail> {
    const media = await this.accessibleMedia(
      actor.id,
      organizationSlug,
      projectId,
      mediaId,
    );
    const transcript = await this.database.transcript.findUnique({
      include: { segments: { orderBy: { index: 'asc' } } },
      where: { mediaAssetId: media.id },
    });
    if (transcript === null) {
      throw new NotFoundException('Transcript not found.');
    }
    return {
      createdAt: transcript.createdAt.toISOString(),
      diarized: transcript.diarized,
      durationSeconds: transcript.durationSeconds,
      id: transcript.id,
      language: transcript.language,
      mediaAssetId: transcript.mediaAssetId,
      model: transcript.model,
      organizationId: transcript.organizationId,
      originalName: media.originalName,
      projectId: transcript.projectId,
      provider: transcript.provider,
      segmentCount: transcript.segments.length,
      speakerCount: transcript.speakerCount,
      segments: transcript.segments.map((segment) => ({
        endSeconds: segment.endSeconds,
        id: segment.id,
        index: segment.index,
        speaker: segment.speaker,
        startSeconds: segment.startSeconds,
        text: segment.text,
      })),
      text: transcript.text,
      updatedAt: transcript.updatedAt.toISOString(),
    };
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

  /**
   * Records the intent to analyze a media asset and hands it to the worker.
   *
   * PostgreSQL is the source of truth: the row is written first, and the unique
   * `(mediaAssetId, type)` index makes a repeated upload completion reuse the
   * existing job instead of queueing a second one. A queue outage therefore
   * cannot lose the record, and it never fails the upload the caller just
   * verified — the job is marked failed so the owner can retry analysis.
   */
  private async queueMediaProbe(
    media: DatabaseMediaAsset,
    options: { readonly restart: boolean },
  ): Promise<DatabaseMediaJob> {
    const queuedAt = new Date();
    const job = await this.database.mediaJob.upsert({
      create: {
        mediaAssetId: media.id,
        organizationId: media.organizationId,
        projectId: media.projectId,
        queuedAt,
        status: 'QUEUED',
        type: 'MEDIA_PROBE',
      },
      update: options.restart
        ? {
            attempts: 0,
            failureReason: null,
            finishedAt: null,
            queuedAt,
            startedAt: null,
            status: 'QUEUED',
          }
        : {},
      where: {
        mediaAssetId_type: { mediaAssetId: media.id, type: 'MEDIA_PROBE' },
      },
    });

    if (!options.restart && job.status !== 'QUEUED') {
      return job;
    }

    try {
      await this.probeQueue.add(
        'probe',
        {
          mediaAssetId: media.id,
          mediaJobId: job.id,
          organizationId: media.organizationId,
          projectId: media.projectId,
        },
        {
          attempts: this.probeConfiguration.attempts,
          backoff: { delay: 5_000, type: 'exponential' },
          // The database row carries the durable outcome, so Redis keeps nothing
          // after the job settles and a retry can reuse the same job id.
          jobId: job.id,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return job;
    } catch (error) {
      this.logger.error(
        `Could not queue media probe for asset ${media.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return this.database.mediaJob.update({
        data: {
          failureReason:
            'The processing queue was unreachable. Retry the analysis.',
          finishedAt: new Date(),
          status: 'FAILED',
        },
        where: { id: job.id },
      });
    }
  }

  private async queueTranscription(
    media: DatabaseMediaAsset,
    options: { readonly restart: boolean },
  ): Promise<DatabaseMediaJob> {
    const queuedAt = new Date();
    const job = await this.database.mediaJob.upsert({
      create: {
        mediaAssetId: media.id,
        organizationId: media.organizationId,
        projectId: media.projectId,
        queuedAt,
        status: 'QUEUED',
        type: 'TRANSCRIPTION',
      },
      update: options.restart
        ? {
            attempts: 0,
            failureReason: null,
            finishedAt: null,
            queuedAt,
            startedAt: null,
            status: 'QUEUED',
          }
        : {},
      where: {
        mediaAssetId_type: { mediaAssetId: media.id, type: 'TRANSCRIPTION' },
      },
    });
    try {
      await this.transcriptionQueue.add(
        'transcribe',
        {
          mediaAssetId: media.id,
          mediaJobId: job.id,
          organizationId: media.organizationId,
          projectId: media.projectId,
        },
        {
          attempts: this.transcriptionConfiguration.attempts,
          backoff: { delay: 10_000, type: 'exponential' },
          jobId: job.id,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return job;
    } catch (error) {
      this.logger.error(
        `Could not queue transcription for asset ${media.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return this.database.mediaJob.update({
        data: {
          failureReason:
            'The processing queue was unreachable. Retry transcription.',
          finishedAt: new Date(),
          status: 'FAILED',
        },
        where: { id: job.id },
      });
    }
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
  ): Promise<MediaAssetWithJobs> {
    this.assertUuid(mediaId, 'Media id');
    const project = await this.accessibleProject(
      userId,
      organizationSlug,
      projectId,
    );
    const media = await this.database.mediaAsset.findFirst({
      include: {
        jobs: true,
        transcript: { include: { _count: { select: { segments: true } } } },
      },
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

  private toSummary(
    media: MediaAssetWithJobs,
    jobs: readonly DatabaseMediaJob[] = media.jobs ?? [],
  ): MediaAssetSummary {
    const sizeBytes = Number(media.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes)) {
      throw new Error('Media size exceeds the supported numeric range.');
    }
    const probe = probeJobOf(jobs);
    const transcription = transcriptionJobOf(jobs);
    return {
      contentType: media.contentType,
      createdAt: media.createdAt.toISOString(),
      id: media.id,
      kind: asMediaKind(media.kind),
      metadata: toTechnicalMetadata(media),
      organizationId: media.organizationId,
      originalName: media.originalName,
      probe: probe === undefined ? null : toJobSummary(probe),
      projectId: media.projectId,
      sizeBytes,
      status: asMediaStatus(media.status),
      transcript:
        media.transcript === null || media.transcript === undefined
          ? null
          : toTranscriptSummary(media.transcript),
      transcription:
        transcription === undefined ? null : toJobSummary(transcription),
      updatedAt: media.updatedAt.toISOString(),
      uploadedAt: media.uploadedAt?.toISOString() ?? null,
      uploadedById: media.uploadedById,
    };
  }
}

function toTranscriptSummary(
  transcript: TranscriptWithCount,
): TranscriptSummary {
  return {
    createdAt: transcript.createdAt.toISOString(),
    diarized: transcript.diarized,
    id: transcript.id,
    language: transcript.language,
    model: transcript.model,
    provider: transcript.provider,
    segmentCount: transcript._count.segments,
    speakerCount: transcript.speakerCount,
    updatedAt: transcript.updatedAt.toISOString(),
  };
}

function toJobSummary(job: DatabaseMediaJob): MediaJobSummary {
  return {
    attempts: job.attempts,
    failureReason: job.failureReason,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    id: job.id,
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    status: asMediaJobStatus(job.status),
    type: asMediaJobType(job.type),
  };
}

/**
 * Technical metadata is only meaningful once a probe has written the whole set,
 * so a partially populated row reports no metadata rather than zeroes.
 */
function toTechnicalMetadata(
  media: DatabaseMediaAsset,
): MediaTechnicalMetadata | null {
  const { durationSeconds, hasAudio, height, width } = media;
  if (
    media.probedAt === null ||
    durationSeconds === null ||
    width === null ||
    height === null
  ) {
    return null;
  }
  return {
    audioCodec: media.audioCodec,
    bitRate: media.bitRate,
    durationSeconds,
    frameRate: media.frameRate,
    hasAudio: hasAudio ?? false,
    height,
    videoCodec: media.videoCodec,
    width,
  };
}
