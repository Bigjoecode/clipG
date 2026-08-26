import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  InvalidAuthenticationTokenError,
  type AuthenticationProvider,
  type VerifiedIdentity,
} from './authentication-provider.js';

const claimsSchema = z.object({
  aud: z.union([z.literal('authenticated'), z.array(z.string())]),
  email: z.email().transform((email) => email.trim().toLowerCase()),
  is_anonymous: z.literal(false).optional(),
  iss: z.url(),
  role: z.literal('authenticated'),
  sub: z.uuid(),
  user_metadata: z.record(z.string(), z.unknown()).optional(),
});

function optionalMetadataText(
  metadata: Record<string, unknown> | undefined,
  keys: readonly string[],
  maximumLength: number,
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string') {
      const normalized = value.trim().slice(0, maximumLength);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return undefined;
}

function optionalAvatarUrl(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const value = optionalMetadataText(
    metadata,
    ['avatar_url', 'picture'],
    2_048,
  );
  if (value === undefined) {
    return undefined;
  }

  const result = z.url().safeParse(value);
  if (!result.success) {
    return undefined;
  }

  const protocol = new URL(result.data).protocol;
  return ['http:', 'https:'].includes(protocol) ? result.data : undefined;
}

export class SupabaseAuthenticationProvider implements AuthenticationProvider {
  private readonly client: SupabaseClient;
  private readonly issuer: string;

  public constructor(
    supabaseUrl: string,
    publishableKey: string,
    client?: SupabaseClient,
  ) {
    this.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    this.client =
      client ??
      createClient(supabaseUrl, publishableKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
  }

  public async verifyAccessToken(
    accessToken: string,
  ): Promise<VerifiedIdentity> {
    const { data, error } = await this.client.auth.getClaims(accessToken);
    if (error !== null || data === null) {
      throw new InvalidAuthenticationTokenError();
    }

    const result = claimsSchema.safeParse(data.claims);
    if (!result.success || result.data.iss !== this.issuer) {
      throw new InvalidAuthenticationTokenError();
    }

    const audience = result.data.aud;
    if (Array.isArray(audience) && !audience.includes('authenticated')) {
      throw new InvalidAuthenticationTokenError();
    }

    const displayName = optionalMetadataText(
      result.data.user_metadata,
      ['full_name', 'name', 'display_name'],
      120,
    );
    const avatarUrl = optionalAvatarUrl(result.data.user_metadata);

    return {
      subject: result.data.sub,
      email: result.data.email,
      ...(displayName === undefined ? {} : { displayName }),
      ...(avatarUrl === undefined ? {} : { avatarUrl }),
    };
  }
}
