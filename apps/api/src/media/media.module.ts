import { parseStorageEnvironment } from '@clipgenius/config';
import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../auth/authentication.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MediaController } from './media.controller.js';
import {
  MEDIA_UPLOAD_CONFIGURATION,
  MediaService,
  type MediaUploadConfiguration,
} from './media.service.js';

@Module({
  controllers: [MediaController],
  imports: [AuthenticationModule, StorageModule],
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
    MediaService,
  ],
})
export class MediaModule {}
