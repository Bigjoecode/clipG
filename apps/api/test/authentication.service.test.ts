import type { PrismaClient } from '@clipgenius/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationProvider } from '../src/auth/authentication-provider.js';
import { AuthenticationService } from '../src/auth/authentication.service.js';

describe('AuthenticationService', () => {
  it('maps the verified provider subject to the application user id', async () => {
    const verifyAccessToken = vi.fn(() =>
      Promise.resolve({
        avatarUrl: 'https://cdn.example/avatar.png',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
      }),
    );
    const upsert = vi.fn(
      (input: {
        readonly create: { readonly id: string };
        readonly where: { readonly id: string };
      }) =>
        Promise.resolve({
          avatarUrl: 'https://cdn.example/avatar.png',
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          id: input.create.id,
        }),
    );
    const service = new AuthenticationService(
      { verifyAccessToken } satisfies AuthenticationProvider,
      { user: { upsert } } as unknown as PrismaClient,
    );

    await expect(service.authenticate('access-token')).resolves.toEqual({
      avatarUrl: 'https://cdn.example/avatar.png',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      id: '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
    });
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]?.[0].create.id).toBe(
      '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
    );
    expect(upsert.mock.calls[0]?.[0].where.id).toBe(
      '8ab3ab7a-5b63-4ad4-9fc8-cce730cf22a0',
    );
  });
});
