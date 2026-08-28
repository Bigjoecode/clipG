import {
  parseMediaProbeEnvironment,
  parseStorageEnvironment,
  parseTranscriptionJobEnvironment,
} from '@clipgenius/config';
import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../auth/authentication.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MediaController } from './media.controller.js';
import {
  MEDIA_PROBE_CONFIGURATION,
  MEDIA_UPLOAD_CONFIGURATION,
  TRANSCRIPTION_CONFIGURATION,
  MediaService,
  type MediaProbeConfiguration,
  type MediaUploadConfiguration,
  type TranscriptionConfiguration,
} from './media.service.js';

@Module({
  controllers: [MediaController],
  imports: [AuthenticationModule, StorageModule, QueueModule],
  providers: [
    {
      provide: MEDIA_UPLOAD_CONFIGURATION,
      useFactory: (): MediaUploadConfiguration => {
        const environment = parseStorageEnvironment(process.env);
        return {
          bucket: environment.SOURCE_VIDEO_BUCKET,
          maxSourceVideoBytes: environment.SOURCE_VIDEO_MAX_BYTES,
        };
      },
    },
    {
      provide: TRANSCRIPTION_CONFIGURATION,
      useFactory: (): TranscriptionConfiguration => {
        const environment = parseTranscriptionJobEnvironment(process.env);
        return { attempts: environment.TRANSCRIPTION_ATTEMPTS };
      },
    },
    {
      provide: MEDIA_PROBE_CONFIGURATION,
      useFactory: (): MediaProbeConfiguration => {
        // The API only needs the retry budget. The Supabase secret key and probe
        // limits belong to the worker and are deliberately not readable here.
        const environment = parseMediaProbeEnvironment(process.env);
        return { attempts: environment.MEDIA_PROBE_ATTEMPTS };
      },
    },
    MediaService,
  ],
})
export class MediaModule {}
