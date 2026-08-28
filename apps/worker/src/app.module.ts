import {
  parseWorkerEnvironment,
  redisConnectionOptionsFromUrl,
} from '@clipgenius/config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { MediaProbeModule } from './media/media-probe.module.js';

const environment = parseWorkerEnvironment(process.env);

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnectionOptionsFromUrl(environment.REDIS_URL),
    }),
    DatabaseModule,
    MediaProbeModule,
  ],
})
export class AppModule {}
