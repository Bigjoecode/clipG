import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentAccessToken,
  CurrentUser,
} from '../auth/authenticated-user.decorator.js';
import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  initiateSourceVideoUploadSchema,
  type InitiateSourceVideoUploadInput,
} from './media.schemas.js';
import { MediaService } from './media.service.js';

import type {
  AuthenticatedUser,
  MediaAssetSummary,
  SourceVideoUploadSession,
} from '@clipgenius/types';

@Controller('organizations/:organizationSlug/projects/:projectId/media')
@UseGuards(AuthenticationGuard)
export class MediaController {
  public constructor(
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  @Post('uploads')
  public initiateSourceVideoUpload(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAccessToken() accessToken: string,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(initiateSourceVideoUploadSchema))
    input: InitiateSourceVideoUploadInput,
  ): Promise<SourceVideoUploadSession> {
    return this.media.initiateSourceVideoUpload(
      user,
      accessToken,
      organizationSlug,
      projectId,
      input,
    );
  }

  @Get()
  public list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
  ): Promise<readonly MediaAssetSummary[]> {
    return this.media.list(user, organizationSlug, projectId);
  }

  @Post(':mediaId/complete')
  public completeSourceVideoUpload(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAccessToken() accessToken: string,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ): Promise<MediaAssetSummary> {
    return this.media.completeSourceVideoUpload(
      user,
      accessToken,
      organizationSlug,
      projectId,
      mediaId,
    );
  }

  @Post(':mediaId/fail')
  public failSourceVideoUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationSlug') organizationSlug: string,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ): Promise<MediaAssetSummary> {
    return this.media.failSourceVideoUpload(
      user,
      organizationSlug,
      projectId,
      mediaId,
    );
  }
}
