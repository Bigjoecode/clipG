import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../auth/authentication.module.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController],
  imports: [AuthenticationModule],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
