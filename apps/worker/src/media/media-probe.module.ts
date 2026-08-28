import { parseMediaProcessingEnvironment } from '@clipgenius/config';
import { mediaProbeQueueName } from '@clipgenius/types';
import { FfprobeVideoProbe, type VideoProbe } from '@clipgenius/video';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  MEDIA_PROBE_SETTINGS,
  MediaProbeProcessor,
  VIDEO_PROBE,
  type MediaProbeSettings,
} from './media-probe.processor.js';
import {
  STALE_UPLOAD_SETTINGS,
  StaleUploadReaper,
  type StaleUploadSettings,
} from './stale-upload.reaper.js';

/** A signed download must outlive a slow transfer of the largest allowed file. */
const signedUrlLifetimeSeconds = 60 * 60;

@Module({
  imports: [BullModule.registerQueue({ name: mediaProbeQueueName })],
  providers: [
    {
      provide: VIDEO_PROBE,
      useFactory: (): VideoProbe => {
        const processing = parseMediaProcessingEnvironment(process.env);
        return new FfprobeVideoProbe({
          timeoutMs: processing.MEDIA_PROBE_TIMEOUT_MS,
        });
      },
    },
    {
      provide: MEDIA_PROBE_SETTINGS,
      useFactory: (): MediaProbeSettings => {
        const processing = parseMediaProcessingEnvironment(process.env);
        return {
          attempts: processing.MEDIA_PROBE_ATTEMPTS,
          maxBytes: processing.MEDIA_PROBE_MAX_BYTES,
          signedUrlLifetimeSeconds,
        };
      },
    },
    {
      provide: STALE_UPLOAD_SETTINGS,
      useFactory: (): StaleUploadSettings => {
        const processing = parseMediaProcessingEnvironment(process.env);
        return {
          maxAgeHours: processing.UPLOAD_PENDING_MAX_AGE_HOURS,
        };
      },
    },
    MediaProbeProcessor,
    StaleUploadReaper,
  ],
})
export class MediaProbeModule {}
