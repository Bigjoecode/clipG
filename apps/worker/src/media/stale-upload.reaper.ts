import type { PrismaClient } from '@clipgenius/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { DATABASE_CLIENT } from '../database/database.module.js';

export const STALE_UPLOAD_SETTINGS = Symbol('STALE_UPLOAD_SETTINGS');

export interface StaleUploadSettings {
  readonly maxAgeHours: number;
}

const sweepIntervalMs = 60 * 60 * 1_000;

/**
 * Closes abandoned upload intents without touching successfully uploaded media.
 * The update is an atomic status-and-age predicate, so concurrent completion can
 * only win before this statement or receive the existing FAILED outcome after it.
 */
@Injectable()
export class StaleUploadReaper
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StaleUploadReaper.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(STALE_UPLOAD_SETTINGS)
    private readonly settings: StaleUploadSettings,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    await this.reap();
    this.timer = setInterval(() => {
      void this.reap().catch((error: unknown) => {
        this.logger.error(
          `Could not reap stale uploads: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }, sweepIntervalMs);
    this.timer.unref();
  }

  public onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  public async reap(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.settings.maxAgeHours * 60 * 60 * 1_000,
    );
    const result = await this.database.mediaAsset.updateMany({
      data: {
        failureReason: 'The upload was abandoned before it completed.',
        status: 'FAILED',
      },
      where: {
        createdAt: { lt: cutoff },
        status: 'UPLOAD_PENDING',
      },
    });
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} abandoned upload(s) as failed.`);
    }
    return result.count;
  }
}
