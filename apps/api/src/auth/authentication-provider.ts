export interface VerifiedIdentity {
  readonly subject: string;
  readonly email: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

export interface AuthenticationProvider {
  verifyAccessToken(accessToken: string): Promise<VerifiedIdentity>;
}

export const AUTHENTICATION_PROVIDER = Symbol('AUTHENTICATION_PROVIDER');

export class InvalidAuthenticationTokenError extends Error {
  public constructor() {
    super('The authentication token is invalid or expired.');
    this.name = 'InvalidAuthenticationTokenError';
  }
}
