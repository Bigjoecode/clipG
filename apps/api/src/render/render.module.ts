import { Module } from '@nestjs/common';

import { QueueModule } from '../queue/queue.module.js';
import { RenderJobService } from './render-job.service.js';

@Module({
  exports: [RenderJobService],
  imports: [QueueModule],
  providers: [RenderJobService],
})
export class RenderModule {}
