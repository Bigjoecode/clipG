import { parseMediaProbeEnvironment } from '@clipgenius/config';
import type { PrismaClient } from '@clipgenius/database';
import type { ServerObjectReader } from '@clipgenius/storage';
import { mediaProbeQueueName, type MediaProbeJobData } from '@clipgenius/types';
import type { VideoMetadata, VideoProbe } from '@clipgenius/video';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';
import { SERVER_OBJECT_READER } from '../storage/storage-reader.module.js';

import {
  discardTemporaryMedia,
  downloadToTemporaryFile,
} from './media-download.js';

export const VIDEO_PROBE = Symbol('VIDEO_PROBE');
export const MEDIA_PROBE_SETTINGS = Symbol('MEDIA_PROBE_SETTINGS');

export interface MediaProbeSettings {
  readonly attempts: number;
  readonly maxBytes: number;
  readonly signedUrlLifetimeSeconds: number;
}

const extensionByContentType: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/**
 * Marks a job as permanently failed. BullMQ stops retrying an
 * `UnrecoverableError`, which is correct for input that will never become valid:
 * deleted media, a payload that does not match the stored row, or a file that
 * carries no video stream.
 */
class PermanentProbeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentProbeError';
  }
}

function failureText(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'The media probe failed.';
  return message.slice(0, 500);
}

// Concurrency is fixed when the class is declared, so it deliberately reads the
// non-secret schema: importing this module must never require a credential.
@Processor(mediaProbeQueueName, {
  concurrency: parseMediaProbeEnvironment(process.env).MEDIA_PROBE_CONCURRENCY,
})
export class MediaProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProbeProcessor.name);

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(SERVER_OBJECT_READER) private readonly storage: ServerObjectReader,
    @Inject(VIDEO_PROBE) private readonly probe: VideoProbe,
    @Inject(MEDIA_PROBE_SETTINGS) private readonly settings: MediaProbeSettings,
  ) {
    super();
  }

  public override async process(job: Job<MediaProbeJobData>): Promise<void> {
    const { mediaJobId } = job.data;
    const record = await this.database.mediaJob.findUnique({
      include: { mediaAsset: true },
      where: { id: mediaJobId },
    });

    // The media or its project may have been deleted while the message waited.
    // That is a normal outcome, not a failure to retry.
    if (record === null) {
      this.logger.log(`Media job ${mediaJobId} no longer exists; skipping.`);
      return;
    }

    // A replayed message must never redo completed work.
    if (record.status === 'SUCCEEDED') {
      return;
    }

    const attempts = record.attempts + 1;

    try {
      // The payload is untrusted transport data; PostgreSQL is authoritative.
      if (
        record.mediaAssetId !== job.data.mediaAssetId ||
        record.organizationId !== job.data.organizationId ||
        record.projectId !== job.data.projectId
      ) {
        throw new PermanentProbeError(
          'The queued job did not match the stored media record.',
        );
      }
      if (record.mediaAsset.status !== 'UPLOADED') {
        throw new PermanentProbeError(
          'The media asset is not a verified upload.',
        );
      }
      const sizeBytes = Number(record.mediaAsset.sizeBytes);
      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes > this.settings.maxBytes
      ) {
        throw new PermanentProbeError(
          'The media asset is larger than the processing limit.',
        );
      }

      await this.database.mediaJob.update({
        data: {
          attempts,
          failureReason: null,
          finishedAt: null,
          startedAt: new Date(),
          status: 'RUNNING',
        },
        where: { id: record.id },
      });

      const metadata = await this.readMetadata(
        record.mediaAsset.storageKey,
        record.mediaAsset.contentType,
      );

      await this.database.$transaction([
        this.database.mediaAsset.update({
          data: {
            audioCodec: metadata.audioCodec,
            bitRate: metadata.bitRate,
            durationSeconds: metadata.durationSeconds,
            frameRate: metadata.frameRate,
            hasAudio: metadata.hasAudio,
            height: metadata.height,
            probedAt: new Date(),
            videoCodec: metadata.videoCodec,
            width: metadata.width,
          },
          where: { id: record.mediaAssetId },
        }),
        this.database.mediaJob.update({
          data: {
            failureReason: null,
            finishedAt: new Date(),
            status: 'SUCCEEDED',
          },
          where: { id: record.id },
        }),
      ]);
      this.logger.log(
        `Probed media ${record.mediaAssetId}: ${metadata.width}x${metadata.height}, ${metadata.durationSeconds}s`,
      );
    } catch (error) {
      const permanent = error instanceof PermanentProbeError;
      const exhausted = attempts >= this.settings.attempts;
      // While retries remain the job is genuinely waiting in the queue again, so
      // it returns to QUEUED and only a terminal outcome is recorded as FAILED.
      await this.database.mediaJob.update({
        data: {
          attempts,
          failureReason: failureText(error),
          ...(permanent || exhausted
            ? { finishedAt: new Date(), status: 'FAILED' as const }
            : { status: 'QUEUED' as const }),
        },
        where: { id: record.id },
      });
      this.logger.error(
        `Media probe failed for asset ${record.mediaAssetId} (attempt ${attempts}): ${failureText(error)}`,
      );
      if (permanent) {
        throw new UnrecoverableError(failureText(error));
      }
      throw error;
    }
  }

  private async readMetadata(
    storageKey: string,
    contentType: string,
  ): Promise<VideoMetadata> {
    const download = await this.storage.createSignedDownloadUrl(
      storageKey,
      this.settings.signedUrlLifetimeSeconds,
    );
    const media = await downloadToTemporaryFile(
      download.url,
      `source.${extensionByContentType[contentType] ?? 'bin'}`,
      this.settings.maxBytes,
    );
    try {
      return await this.probe.probe({ uri: media.path });
    } finally {
      await discardTemporaryMedia(media);
    }
  }
}
