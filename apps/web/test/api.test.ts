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
  it('retries a read request once after a reset API connection', async () => {
    const response = new Response(JSON.stringify([{ id: 'organization-id' }]), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response);

    await expect(authenticatedApiRequest('/organizations')).resolves.toEqual([
      { id: 'organization-id' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns repeated connection resets into a recoverable service error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
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

  it('does not retry an ambiguous failed write request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      authenticatedApiRequest('/organizations', {
        body: JSON.stringify({ name: 'Creator Studio' }),
        method: 'POST',
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
