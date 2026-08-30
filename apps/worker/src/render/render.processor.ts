import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { parseRenderEnvironment } from '@clipgenius/config';
import type { PrismaClient } from '@clipgenius/database';
import type {
  ServerObjectReader,
  ServerObjectWriter,
} from '@clipgenius/storage';
import { renderQueueName, type RenderJobData } from '@clipgenius/types';
import {
  RenderError,
  renderAssetManifestSchema,
  validatePlanForRendering,
  type Renderer,
  type ResolvedRenderAsset,
  type StoredRenderAsset,
} from '@clipgenius/video';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';
import {
  discardTemporaryMedia,
  downloadToTemporaryFile,
  MediaDownloadError,
  type DownloadedMedia,
} from '../media/media-download.js';
import {
  SERVER_OBJECT_READER,
  SERVER_OBJECT_WRITER,
} from '../storage/storage-reader.module.js';
import { StorageWriteError } from '../storage/supabase-server-object-writer.js';
import { StorageReadError } from '../storage/supabase-server-object-reader.js';

export const VIDEO_RENDERER = Symbol('VIDEO_RENDERER');
export const RENDER_SETTINGS = Symbol('RENDER_SETTINGS');

export interface RenderSettings {
  readonly attempts: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly outputBucket: string;
  readonly signedUrlLifetimeSeconds: number;
}

const permanentCategories = new Set([
  'INVALID_EDIT_PLAN',
  'MISSING_SOURCE_MEDIA',
  'MISSING_ASSET',
  'UNSUPPORTED_OPERATION',
  'UNSUPPORTED_CODEC',
]);

function failureReason(error: unknown): string {
  return (error instanceof Error ? error.message : 'Render failed.').slice(
    0,
    500,
  );
}

function extension(asset: StoredRenderAsset): string {
  const fromKey = extname(asset.storageKey).replace('.', '');
  if (/^[a-z0-9]{1,8}$/i.test(fromKey)) return fromKey;
  if (asset.kind === 'IMAGE') return 'png';
  return asset.kind === 'VIDEO' ? 'mp4' : 'bin';
}

@Processor(renderQueueName, {
  concurrency: parseRenderEnvironment(process.env).RENDER_CONCURRENCY,
})
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(SERVER_OBJECT_READER) private readonly reader: ServerObjectReader,
    @Inject(SERVER_OBJECT_WRITER) private readonly writer: ServerObjectWriter,
    @Inject(VIDEO_RENDERER) private readonly renderer: Renderer,
    @Inject(RENDER_SETTINGS) private readonly settings: RenderSettings,
  ) {
    super();
  }

  public override async process(job: Job<RenderJobData>): Promise<void> {
    const record = await this.database.render.findUnique({
      include: { sourceMedia: true },
      where: { id: job.data.renderId },
    });
    if (record === null) {
      this.logger.log(
        `Render ${job.data.renderId} no longer exists; skipping.`,
      );
      return;
    }
    if (record.status === 'SUCCEEDED') return;
    const attempts = record.attempts + 1;
    let category: RenderError['category'] | undefined;
    const downloads: DownloadedMedia[] = [];
    let outputDirectory: string | undefined;
    try {
      if (
        record.organizationId !== job.data.organizationId ||
        record.projectId !== job.data.projectId ||
        record.sourceMediaAssetId !== job.data.sourceMediaAssetId
      ) {
        throw new RenderError(
          'INVALID_EDIT_PLAN',
          'Queued render identifiers do not match the stored render.',
        );
      }
      if (
        record.sourceMedia.status !== 'UPLOADED' ||
        record.sourceMedia.hasAudio === null
      ) {
        throw new RenderError(
          'MISSING_SOURCE_MEDIA',
          'Source media is unavailable or has not completed media probing.',
        );
      }
      const manifestResult = renderAssetManifestSchema.safeParse(
        record.assetManifest,
      );
      if (!manifestResult.success) {
        throw new RenderError(
          'INVALID_EDIT_PLAN',
          'Stored render asset manifest is invalid.',
        );
      }
      const manifest = manifestResult.data;
      const plan = validatePlanForRendering(record.editPlan, {
        allowAiGeneratedAssets: record.allowAiGeneratedAssets,
        assets: manifest.map((asset) => ({
          assetId: asset.assetId,
          ...(asset.durationMs === undefined
            ? {}
            : { durationMs: asset.durationMs }),
          kind: asset.kind,
          source: asset.source,
        })),
        sourceDurationMs: Math.round(
          (record.sourceMedia.durationSeconds ?? 0) * 1_000,
        ),
        sourceMediaId: record.sourceMediaAssetId,
      });
      await this.database.render.update({
        data: {
          attempts,
          errorCategory: null,
          failureReason: null,
          finishedAt: null,
          startedAt: new Date(),
          status: 'RUNNING',
        },
        where: { id: record.id },
      });

      const source = await this.download(
        record.sourceMedia.storageBucket,
        record.sourceMedia.storageKey,
        `source${extname(record.sourceMedia.storageKey) || '.mp4'}`,
        Number(record.sourceMedia.sizeBytes),
      );
      downloads.push(source);
      const resolvedAssets: ResolvedRenderAsset[] = [];
      for (const asset of manifest) {
        const downloaded = await this.download(
          asset.storageBucket,
          asset.storageKey,
          `${asset.assetId}.${extension(asset)}`,
          asset.sizeBytes,
        );
        downloads.push(downloaded);
        resolvedAssets.push({
          assetId: asset.assetId,
          kind: asset.kind,
          path: downloaded.path,
          source: asset.source,
        });
      }
      outputDirectory = await mkdtemp(
        join(tmpdir(), 'clipgenius-render-output-'),
      );
      const outputPath = join(outputDirectory, 'output.mp4');
      const result = await this.renderer.render({
        assets: resolvedAssets,
        outputPath,
        plan,
        source: {
          hasAudio: record.sourceMedia.hasAudio,
          mediaAssetId: record.sourceMediaAssetId,
          path: source.path,
        },
      });
      if (result.media.sizeBytes > this.settings.maxOutputBytes) {
        throw new RenderError(
          'STORAGE_FAILURE',
          'Rendered output exceeds the configured storage limit.',
        );
      }
      const outputKey = `organizations/${record.organizationId}/projects/${record.projectId}/renders/${record.id}/output.mp4`;
      await this.writer.putFile({
        bucket: this.settings.outputBucket,
        contentType: 'video/mp4',
        key: outputKey,
        path: outputPath,
      });
      await this.database.render.update({
        data: {
          backend: result.backend,
          errorCategory: null,
          failureReason: null,
          finishedAt: new Date(),
          outputAudioCodec: result.media.audioCodec,
          outputBucket: this.settings.outputBucket,
          outputContentType: 'video/mp4',
          outputDurationMs: result.media.durationMs,
          outputHeight: result.media.height,
          outputKey,
          outputSizeBytes: result.media.sizeBytes,
          outputVideoCodec: result.media.videoCodec,
          outputWidth: result.media.width,
          renderDurationMs: result.renderDurationMs,
          rendererVersion: result.version,
          status: 'SUCCEEDED',
        },
        where: { id: record.id },
      });
      this.logger.log(
        `Rendered ${record.id} with ${result.backend}@${result.version} in ${result.renderDurationMs}ms.`,
      );
    } catch (error) {
      category =
        error instanceof RenderError
          ? error.category
          : error instanceof StorageWriteError ||
              error instanceof StorageReadError ||
              error instanceof MediaDownloadError
            ? 'STORAGE_FAILURE'
            : 'RENDERER_FAILURE';
      const permanent = permanentCategories.has(category);
      const exhausted = attempts >= this.settings.attempts;
      await this.database.render.update({
        data: {
          attempts,
          errorCategory: category,
          failureReason: failureReason(error),
          ...(permanent || exhausted
            ? { finishedAt: new Date(), status: 'FAILED' as const }
            : { status: 'QUEUED' as const }),
        },
        where: { id: record.id },
      });
      this.logger.error(
        `Render ${record.id} failed (${category}, attempt ${attempts}): ${failureReason(error)}`,
      );
      if (permanent) throw new UnrecoverableError(failureReason(error));
      throw error;
    } finally {
      await Promise.all(downloads.map(discardTemporaryMedia));
      if (outputDirectory !== undefined) {
        await rm(outputDirectory, { force: true, recursive: true });
      }
    }
  }

  private async download(
    bucket: string,
    key: string,
    fileName: string,
    declaredBytes: number,
  ): Promise<DownloadedMedia> {
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes <= 0 ||
      declaredBytes > this.settings.maxInputBytes
    ) {
      throw new RenderError(
        'MISSING_ASSET',
        'Render input size is invalid or exceeds the configured limit.',
      );
    }
    const signed = await this.reader.createSignedDownloadUrl(
      key,
      this.settings.signedUrlLifetimeSeconds,
      bucket,
    );
    return downloadToTemporaryFile(
      signed.url,
      fileName,
      this.settings.maxInputBytes,
    );
  }
}
