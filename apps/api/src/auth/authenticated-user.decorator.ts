import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from './authentication.guard.js';
import type { AuthenticatedUser } from '@clipgenius/types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.authenticatedUser === undefined) {
      throw new Error('CurrentUser requires AuthenticationGuard.');
    }
    return request.authenticatedUser;
  },
);
