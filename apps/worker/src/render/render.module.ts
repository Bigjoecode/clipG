import {
  parseMediaProcessingEnvironment,
  parseRenderEnvironment,
  parseStorageEnvironment,
} from '@clipgenius/config';
import { renderQueueName } from '@clipgenius/types';
import { FfmpegRenderer, type Renderer } from '@clipgenius/video';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  RENDER_SETTINGS,
  RenderProcessor,
  VIDEO_RENDERER,
  type RenderSettings,
} from './render.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: renderQueueName })],
  providers: [
    {
      provide: VIDEO_RENDERER,
      useFactory: (): Renderer => {
        const environment = parseRenderEnvironment(process.env);
        return new FfmpegRenderer({ timeoutMs: environment.RENDER_TIMEOUT_MS });
      },
    },
    {
      provide: RENDER_SETTINGS,
      useFactory: (): RenderSettings => {
        const render = parseRenderEnvironment(process.env);
        const media = parseMediaProcessingEnvironment(process.env);
        const storage = parseStorageEnvironment(process.env);
        return {
          attempts: render.RENDER_ATTEMPTS,
          maxInputBytes: media.MEDIA_PROBE_MAX_BYTES,
          maxOutputBytes: render.RENDER_MAX_OUTPUT_BYTES,
          outputBucket: storage.SOURCE_VIDEO_BUCKET,
          signedUrlLifetimeSeconds: 60 * 60,
        };
      },
    },
    RenderProcessor,
  ],
})
export class RenderModule {}
