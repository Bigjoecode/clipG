import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { InvalidAuthenticationTokenError } from '../src/auth/authentication-provider.js';
import { SupabaseAuthenticationProvider } from '../src/auth/supabase-authentication.provider.js';

const projectUrl = 'https://project.supabase.co';

describe('SupabaseAuthenticationProvider', () => {
  it('accepts verified authenticated-user claims and sanitizes metadata', async () => {
    const getClaims = vi.fn(() =>
      Promise.resolve({
        data: {
          claims: {
            aud: 'authenticated',
            email: 'ADA@EXAMPLE.COM',
            is_anonymous: false,
            iss: `${projectUrl}/auth/v1`,
            role: 'authenticated',
            sub: '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
            user_metadata: {
              avatar_url: 'javascript:alert(1)',
              full_name: ' Ada Lovelace ',
            },
          },
        },
        error: null,
      }),
    );
    const provider = new SupabaseAuthenticationProvider(
      projectUrl,
      'sb_publishable_test_key',
      { auth: { getClaims } } as unknown as SupabaseClient,
    );

    await expect(provider.verifyAccessToken('token')).resolves.toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
    });
  });

  it('rejects a validly shaped token from a different issuer', async () => {
    const provider = new SupabaseAuthenticationProvider(
      projectUrl,
      'sb_publishable_test_key',
      {
        auth: {
          getClaims: vi.fn(() =>
            Promise.resolve({
              data: {
                claims: {
                  aud: 'authenticated',
                  email: 'user@example.com',
                  iss: 'https://attacker.example/auth/v1',
                  role: 'authenticated',
                  sub: '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
                },
              },
              error: null,
            }),
          ),
        },
      } as unknown as SupabaseClient,
    );

    await expect(provider.verifyAccessToken('token')).rejects.toBeInstanceOf(
      InvalidAuthenticationTokenError,
    );
  });
});
