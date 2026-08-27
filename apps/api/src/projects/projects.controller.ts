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
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from './project.schemas.js';
import { ProjectsService } from './projects.service.js';

import type { AuthenticatedUser, ProjectSummary } from '@clipgenius/types';

@Controller('organizations/:organizationSlug/projects')
@UseGuards(AuthenticationGuard)
export class ProjectsController {
  public constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  @Post()
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Body(new ZodValidationPipe(createProjectSchema)) input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    return this.projects.create(user, organizationSlug, input);
  }

  @Get()
  public list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<readonly ProjectSummary[]> {
    return this.projects.list(user, organizationSlug);
  }

  @Get(':projectId')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
  ): Promise<ProjectSummary> {
    return this.projects.get(user, organizationSlug, projectId);
  }

  @Patch(':projectId')
  public update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) input: UpdateProjectInput,
  ): Promise<ProjectSummary> {
    return this.projects.update(user, organizationSlug, projectId, input);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    return this.projects.delete(user, organizationSlug, projectId);
  }
}
