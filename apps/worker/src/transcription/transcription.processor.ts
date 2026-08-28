import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { parseTranscriptionJobEnvironment } from '@clipgenius/config';
import {
  TranscriptionProviderError,
  type TranscriptionProvider,
} from '@clipgenius/ai';
import type { PrismaClient } from '@clipgenius/database';
import type { ServerObjectReader } from '@clipgenius/storage';
import {
  transcriptionQueueName,
  type TranscriptionJobData,
} from '@clipgenius/types';
import { AudioExtractionError, type AudioExtractor } from '@clipgenius/video';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';
import {
  discardTemporaryMedia,
  downloadToTemporaryFile,
} from '../media/media-download.js';
import { SERVER_OBJECT_READER } from '../storage/storage-reader.module.js';

export const AUDIO_EXTRACTOR = Symbol('AUDIO_EXTRACTOR');
export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');
export const TRANSCRIPTION_SETTINGS = Symbol('TRANSCRIPTION_SETTINGS');

export interface TranscriptionSettings {
  readonly attempts: number;
  readonly maxAudioBytes: number;
  readonly maxSourceBytes: number;
  readonly signedUrlLifetimeSeconds: number;
}

const extensionByContentType: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

class PermanentTranscriptionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentTranscriptionError';
  }
}

function failureText(error: unknown): string {
  return (
    error instanceof Error ? error.message : 'The transcription job failed.'
  ).slice(0, 500);
}

@Processor(transcriptionQueueName, {
  concurrency: parseTranscriptionJobEnvironment(process.env)
    .TRANSCRIPTION_CONCURRENCY,
})
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(SERVER_OBJECT_READER) private readonly storage: ServerObjectReader,
    @Inject(AUDIO_EXTRACTOR) private readonly extractor: AudioExtractor,
    @Inject(TRANSCRIPTION_PROVIDER)
    private readonly provider: TranscriptionProvider,
    @Inject(TRANSCRIPTION_SETTINGS)
    private readonly settings: TranscriptionSettings,
  ) {
    super();
  }

  public override async process(job: Job<TranscriptionJobData>): Promise<void> {
    const record = await this.database.mediaJob.findUnique({
      include: { mediaAsset: true },
      where: { id: job.data.mediaJobId },
    });
    if (record === null) {
      this.logger.log(
        `Transcription job ${job.data.mediaJobId} no longer exists; skipping.`,
      );
      return;
    }
    if (record.status === 'SUCCEEDED') {
      return;
    }

    const attempts = record.attempts + 1;
    try {
      if (
        record.type !== 'TRANSCRIPTION' ||
        record.mediaAssetId !== job.data.mediaAssetId ||
        record.organizationId !== job.data.organizationId ||
        record.projectId !== job.data.projectId
      ) {
        throw new PermanentTranscriptionError(
          'The queued job did not match the stored transcription record.',
        );
      }
      const media = record.mediaAsset;
      if (media.status !== 'UPLOADED' || media.probedAt === null) {
        throw new PermanentTranscriptionError(
          'The source video has not completed media analysis.',
        );
      }
      if (media.hasAudio !== true) {
        throw new PermanentTranscriptionError(
          'The source video contains no audio stream.',
        );
      }
      const sourceBytes = Number(media.sizeBytes);
      if (
        !Number.isSafeInteger(sourceBytes) ||
        sourceBytes > this.settings.maxSourceBytes
      ) {
        throw new PermanentTranscriptionError(
          'The source video is larger than the processing limit.',
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

      const transcript = await this.transcribeMedia(
        media.storageKey,
        media.contentType,
      );
      const existing = await this.database.transcript.findUnique({
        select: { id: true },
        where: { mediaAssetId: media.id },
      });
      const transcriptId = existing?.id ?? randomUUID();
      await this.database.$transaction([
        this.database.transcript.upsert({
          create: {
            diarized: transcript.diarized,
            durationSeconds: transcript.durationSeconds,
            id: transcriptId,
            language: transcript.language,
            mediaAssetId: media.id,
            model: transcript.model,
            organizationId: media.organizationId,
            projectId: media.projectId,
            provider: transcript.provider,
            speakerCount: transcript.speakerCount,
            text: transcript.text,
          },
          update: {
            diarized: transcript.diarized,
            durationSeconds: transcript.durationSeconds,
            language: transcript.language,
            model: transcript.model,
            provider: transcript.provider,
            speakerCount: transcript.speakerCount,
            text: transcript.text,
          },
          where: { mediaAssetId: media.id },
        }),
        this.database.transcriptSegment.deleteMany({
          where: { transcriptId },
        }),
        this.database.transcriptSegment.createMany({
          data: transcript.segments.map((segment, index) => ({
            endSeconds: segment.endSeconds,
            index,
            speaker: segment.speaker,
            startSeconds: segment.startSeconds,
            text: segment.text,
            transcriptId,
          })),
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
        `Transcribed media ${media.id} with ${transcript.provider}: ${transcript.segments.length} segment(s), ${
          transcript.diarized
            ? `${transcript.speakerCount ?? 0} speaker(s)`
            : 'no diarization'
        }.`,
      );
    } catch (error) {
      const permanent =
        error instanceof PermanentTranscriptionError ||
        error instanceof AudioExtractionError ||
        (error instanceof TranscriptionProviderError && !error.retryable);
      const exhausted = attempts >= this.settings.attempts;
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
        `Transcription failed for media ${record.mediaAssetId} (attempt ${attempts}): ${failureText(error)}`,
      );
      if (permanent) {
        throw new UnrecoverableError(failureText(error));
      }
      throw error;
    }
  }

  private async transcribeMedia(storageKey: string, contentType: string) {
    const download = await this.storage.createSignedDownloadUrl(
      storageKey,
      this.settings.signedUrlLifetimeSeconds,
    );
    const source = await downloadToTemporaryFile(
      download.url,
      `source.${extensionByContentType[contentType] ?? 'bin'}`,
      this.settings.maxSourceBytes,
    );
    try {
      const audio = await this.extractor.extract({
        outputPath: join(source.directory, 'speech.mp3'),
        sourcePath: source.path,
      });
      if (audio.sizeBytes > this.settings.maxAudioBytes) {
        throw new PermanentTranscriptionError(
          'The extracted audio exceeds the transcription upload limit.',
        );
      }
      return await this.provider.transcribe({ mediaUri: audio.path });
    } finally {
      await discardTemporaryMedia(source);
    }
  }
}
