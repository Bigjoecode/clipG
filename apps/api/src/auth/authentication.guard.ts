import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthenticationService } from './authentication.service.js';

import type { AuthenticatedUser } from '@clipgenius/types';

export interface AuthenticatedRequest {
  readonly headers: {
    readonly authorization?: string | readonly string[];
  };
  authenticatedUser?: AuthenticatedUser;
  authenticatedAccessToken?: string;
}

function bearerTokenFromHeader(
  authorization: string | readonly string[] | undefined,
): string {
  if (typeof authorization !== 'string' || authorization.length > 8_192) {
    throw new UnauthorizedException('A bearer access token is required.');
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (match?.[1] === undefined) {
    throw new UnauthorizedException('A bearer access token is required.');
  }

  return match[1];
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(
    @Inject(AuthenticationService)
    private readonly authenticationService: AuthenticationService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenFromHeader(request.headers.authorization);
    request.authenticatedUser =
      await this.authenticationService.authenticate(token);
    request.authenticatedAccessToken = token;
    return true;
  }
}
