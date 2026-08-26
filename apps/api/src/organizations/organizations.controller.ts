import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/authenticated-user.decorator.js';
import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createOrganizationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
} from './organization.schemas.js';
import { OrganizationsService } from './organizations.service.js';

import type {
  AuthenticatedUser,
  OrganizationDetail,
  OrganizationMember,
  OrganizationSummary,
} from '@clipgenius/types';

@Controller('organizations')
@UseGuards(AuthenticationGuard)
export class OrganizationsController {
  public constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  @Post()
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrganizationSchema))
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary> {
    return this.organizations.create(user, input);
  }

  @Get()
  public list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<readonly OrganizationSummary[]> {
    return this.organizations.list(user);
  }

  @Get(':slug')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<OrganizationDetail> {
    return this.organizations.get(user, slug);
  }

  @Patch(':slug')
  public update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    input: UpdateOrganizationInput,
  ): Promise<OrganizationSummary> {
    return this.organizations.update(user, slug, input);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<void> {
    return this.organizations.delete(user, slug);
  }

  @Get(':slug/members')
  public listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<readonly OrganizationMember[]> {
    return this.organizations.listMembers(user, slug);
  }

  @Patch(':slug/members/:userId')
  public updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    input: UpdateMemberRoleInput,
  ): Promise<OrganizationMember> {
    return this.organizations.updateMemberRole(user, slug, targetUserId, input);
  }

  @Delete(':slug/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    return this.organizations.removeMember(user, slug, targetUserId);
  }
}
