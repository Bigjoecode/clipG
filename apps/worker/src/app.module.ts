import {
  parseWorkerEnvironment,
  redisConnectionOptionsFromUrl,
} from '@clipgenius/config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { MediaProbeModule } from './media/media-probe.module.js';
import { StorageReaderModule } from './storage/storage-reader.module.js';
import { TranscriptionModule } from './transcription/transcription.module.js';
import { ContentIntelligenceModule } from './content-intelligence/content-intelligence.module.js';

const environment = parseWorkerEnvironment(process.env);

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnectionOptionsFromUrl(environment.REDIS_URL),
    }),
    DatabaseModule,
    StorageReaderModule,
    MediaProbeModule,
    TranscriptionModule,
    ContentIntelligenceModule,
  ],
})
export class AppModule {}
