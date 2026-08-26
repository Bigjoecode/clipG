import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from './authenticated-user.decorator.js';
import { AuthenticationGuard } from './authentication.guard.js';

import type { AuthenticatedUser } from '@clipgenius/types';

@Controller('auth')
export class AuthenticationController {
  @Get('me')
  @UseGuards(AuthenticationGuard)
  public me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
