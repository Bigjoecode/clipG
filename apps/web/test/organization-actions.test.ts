import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticatedApiRequest: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  authenticatedApiRequest: mocks.authenticatedApiRequest,
}));

import {
  createOrganization,
  updateOrganization,
} from '../app/organizations/actions.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('organization action feedback', () => {
  it('redirects a created workspace with a success message', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({
      slug: 'creator-studio',
    });
    const formData = new FormData();
    formData.set('name', 'Creator Studio');

    await expect(createOrganization(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.redirect).toHaveBeenCalledWith(
      '/organizations/creator-studio?message=Workspace%20created%20successfully.',
    );
  });

  it('redirects a saved organization with a success message', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({
      slug: 'creator-studio',
    });
    const formData = new FormData();
    formData.set('currentSlug', 'creator-studio');
    formData.set('name', 'Creator Studio');
    formData.set('slug', 'creator-studio');

    await expect(updateOrganization(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.redirect).toHaveBeenCalledWith(
      '/organizations/creator-studio?message=Organization%20saved%20successfully.',
    );
  });
});
