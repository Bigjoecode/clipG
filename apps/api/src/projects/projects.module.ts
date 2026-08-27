import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../auth/authentication.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [ProjectsController],
  imports: [AuthenticationModule],
  providers: [ProjectsService],
})
export class ProjectsModule {}
