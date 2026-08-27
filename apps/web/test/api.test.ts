import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../lib/environment', () => ({
  getWebEnvironment: () => ({ API_URL: 'http://localhost:4000' }),
}));
vi.mock('../lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getClaims: () => Promise.resolve({ data: { claims: {} }, error: null }),
        getSession: () =>
          Promise.resolve({
            data: { session: { access_token: 'test-access-token' } },
          }),
      },
    }),
}));

import { ApiRequestError, authenticatedApiRequest } from '../lib/api.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('authenticatedApiRequest', () => {
  it('turns a reset API connection into a recoverable service error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed'),
    );

    await expect(authenticatedApiRequest('/organizations')).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        message:
          'The API connection was interrupted. Refresh to check whether the change completed before trying again.',
        name: 'ApiRequestError',
        status: 503,
      }),
    );
  });
});
