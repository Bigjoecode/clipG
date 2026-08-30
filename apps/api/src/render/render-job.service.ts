import { createHash } from 'node:crypto';

import { parseRenderEnvironment } from '@clipgenius/config';
import type { PrismaClient } from '@clipgenius/database';
import { serializeEditPlan } from '@clipgenius/editing-language';
import { renderQueueName, type RenderJobData } from '@clipgenius/types';
import {
  renderAssetManifestSchema,
  validatePlanForRendering,
  type RenderAssetManifest,
} from '@clipgenius/video';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { DATABASE_CLIENT } from '../database/database.module.js';

export interface CreateRenderJobInput {
  readonly allowAiGeneratedAssets?: boolean;
  readonly assetManifest: RenderAssetManifest;
  readonly editPlan: unknown;
  readonly organizationId: string;
  readonly projectId: string;
  readonly sourceMediaAssetId: string;
}

@Injectable()
export class RenderJobService {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @InjectQueue(renderQueueName)
    private readonly queue: Queue<RenderJobData>,
  ) {}

  public async create(input: CreateRenderJobInput) {
    const source = await this.database.mediaAsset.findFirst({
      include: { project: { select: { status: true } } },
      where: {
        id: input.sourceMediaAssetId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
    });
    if (source === null) throw new NotFoundException('Source media not found.');
    if (
      source.status !== 'UPLOADED' ||
      source.durationSeconds === null ||
      source.hasAudio === null ||
      source.project.status !== 'ACTIVE'
    ) {
      throw new BadRequestException(
        'Source media must be uploaded, probed, and belong to an active project.',
      );
    }
    const manifest = renderAssetManifestSchema.parse(input.assetManifest);
    const validated = validatePlanForRendering(input.editPlan, {
      allowAiGeneratedAssets: input.allowAiGeneratedAssets ?? false,
      assets: manifest.map((asset) => ({
        assetId: asset.assetId,
        ...(asset.durationMs === undefined
          ? {}
          : { durationMs: asset.durationMs }),
        kind: asset.kind,
        source: asset.source,
      })),
      sourceDurationMs: Math.round(source.durationSeconds * 1_000),
      sourceMediaId: source.id,
    });
    const serializedPlan = serializeEditPlan(validated.plan);
    const canonicalManifest = [...manifest].sort((left, right) =>
      left.assetId.localeCompare(right.assetId),
    );
    const serializedManifest = JSON.stringify(canonicalManifest);
    const idempotencyKey = createHash('sha256')
      .update(source.id)
      .update('\0')
      .update(serializedPlan)
      .update('\0')
      .update(serializedManifest)
      .digest('hex');
    const render = await this.database.render.upsert({
      create: {
        allowAiGeneratedAssets: input.allowAiGeneratedAssets ?? false,
        assetManifest: canonicalManifest,
        editPlan: validated.plan,
        idempotencyKey,
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourceMediaAssetId: source.id,
      },
      update: {},
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey,
          organizationId: input.organizationId,
        },
      },
    });
    if (render.status === 'QUEUED') {
      const settings = parseRenderEnvironment(process.env);
      await this.queue.add(
        renderQueueName,
        {
          organizationId: render.organizationId,
          projectId: render.projectId,
          renderId: render.id,
          sourceMediaAssetId: render.sourceMediaAssetId,
        },
        {
          attempts: settings.RENDER_ATTEMPTS,
          backoff: { delay: 5_000, type: 'exponential' },
          jobId: render.id,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }
    return render;
  }
}
