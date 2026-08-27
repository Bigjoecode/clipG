import { Module } from '@nestjs/common';

import { AuthenticationModule } from './auth/authentication.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ProjectsModule } from './projects/projects.module.js';

@Module({
  controllers: [HealthController],
  imports: [
    DatabaseModule,
    AuthenticationModule,
    OrganizationsModule,
    ProjectsModule,
  ],
})
export class AppModule {}
