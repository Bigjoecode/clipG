import { Module } from '@nestjs/common';

import { AuthenticationModule } from './auth/authentication.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { OrganizationsModule } from './organizations/organizations.module.js';

@Module({
  controllers: [HealthController],
  imports: [DatabaseModule, AuthenticationModule, OrganizationsModule],
})
export class AppModule {}
