import { type PrismaClient } from '@clipgenius/database';
import { type AuthenticatedUser } from '@clipgenius/types';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { DATABASE_CLIENT } from '../database/database.module.js';
import {
  AUTHENTICATION_PROVIDER,
  InvalidAuthenticationTokenError,
  type AuthenticationProvider,
} from './authentication-provider.js';

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class AuthenticationService {
  public constructor(
    @Inject(AUTHENTICATION_PROVIDER)
    private readonly authenticationProvider: AuthenticationProvider,
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  public async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    let identity;
    try {
      identity =
        await this.authenticationProvider.verifyAccessToken(accessToken);
    } catch (error) {
      if (error instanceof InvalidAuthenticationTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    try {
      const user = await this.database.user.upsert({
        create: {
          id: identity.subject,
          email: identity.email,
          ...(identity.displayName === undefined
            ? {}
            : { displayName: identity.displayName }),
          ...(identity.avatarUrl === undefined
            ? {}
            : { avatarUrl: identity.avatarUrl }),
        },
        update: {
          email: identity.email,
          ...(identity.displayName === undefined
            ? {}
            : { displayName: identity.displayName }),
          ...(identity.avatarUrl === undefined
            ? {}
            : { avatarUrl: identity.avatarUrl }),
        },
        where: { id: identity.subject },
      });

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      };
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'This email is already linked to a different ClipGenius identity.',
        );
      }
      throw error;
    }
  }
}
