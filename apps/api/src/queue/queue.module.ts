import {
  parseWorkerEnvironment,
  redisConnectionOptionsFromUrl,
} from '@clipgenius/config';
import {
  contentIntelligenceQueueName,
  mediaProbeQueueName,
  transcriptionQueueName,
  renderQueueName,
} from '@clipgenius/types';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

const environment = parseWorkerEnvironment(process.env);
const connection = redisConnectionOptionsFromUrl(environment.REDIS_URL);

/**
 * The API is a producer only. It never registers a processor, so a queued job is
 * always executed by the worker process rather than inside an HTTP request.
 */
@Module({
  exports: [BullModule],
  imports: [
    BullModule.forRoot({
      connection: {
        ...connection,
        // HTTP requests must fail the queue handoff quickly when Redis is down.
        // PostgreSQL retains the failed job intent so the user can retry later.
        connectTimeout: 5_000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      },
    }),
    BullModule.registerQueue(
      { name: mediaProbeQueueName },
      { name: transcriptionQueueName },
      { name: contentIntelligenceQueueName },
      { name: renderQueueName },
    ),
  ],
})
export class QueueModule {}
