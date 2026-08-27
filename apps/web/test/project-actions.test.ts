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
  createProject,
  deleteProject,
  setProjectStatus,
  updateProject,
} from '../app/organizations/[slug]/projects/actions.js';

const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('project action feedback', () => {
  it('redirects a created project with a success message', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({ id: projectId });
    const formData = new FormData();
    formData.set('organizationSlug', 'creator-studio');
    formData.set('name', 'Sunday Sermon');

    await expect(createProject(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.authenticatedApiRequest).toHaveBeenCalledWith(
      '/organizations/creator-studio/projects',
      {
        body: JSON.stringify({
          description: null,
          name: 'Sunday Sermon',
        }),
        method: 'POST',
      },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/organizations/creator-studio/projects/${projectId}?message=Project%20created%20successfully.`,
    );
  });

  it('redirects a saved project with a success message', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({ id: projectId });
    const formData = new FormData();
    formData.set('organizationSlug', 'creator-studio');
    formData.set('projectId', projectId);
    formData.set('name', 'Sunday Sermon');
    formData.set('description', 'Weekly teaching project');

    await expect(updateProject(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/organizations/creator-studio/projects/${projectId}?message=Project%20saved%20successfully.`,
    );
  });

  it('reports archive and delete completion', async () => {
    mocks.authenticatedApiRequest.mockResolvedValue({ id: projectId });
    const archiveData = new FormData();
    archiveData.set('organizationSlug', 'creator-studio');
    archiveData.set('projectId', projectId);
    archiveData.set('status', 'ARCHIVED');

    await expect(setProjectStatus(archiveData)).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mocks.redirect).toHaveBeenLastCalledWith(
      `/organizations/creator-studio/projects/${projectId}?message=Project%20archived%20successfully.`,
    );

    const deleteData = new FormData();
    deleteData.set('organizationSlug', 'creator-studio');
    deleteData.set('projectId', projectId);
    await expect(deleteProject(deleteData)).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenLastCalledWith(
      '/organizations/creator-studio?message=Project%20deleted%20successfully.',
    );
  });
});
