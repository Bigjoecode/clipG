import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticatedApiRequest: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  authenticatedApiRequest: mocks.authenticatedApiRequest,
}));

import {
  completeSourceVideoUpload,
  initiateSourceVideoUpload,
} from '../app/organizations/[slug]/projects/[projectId]/media-actions.js';

const projectId = '5ea74442-0c18-4e90-a009-300fa2f39cbd';
const mediaId = 'c728fe4f-2b0d-4a28-8191-608c52e50d88';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('media upload actions', () => {
  it('initiates a source upload without sending file bytes through the action', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({
      media: { id: mediaId },
    });

    await expect(
      initiateSourceVideoUpload({
        contentType: 'video/mp4',
        fileName: 'sermon.mp4',
        organizationSlug: 'creator-studio',
        projectId,
        sizeBytes: 1_024,
      }),
    ).resolves.toEqual({ data: { media: { id: mediaId } } });
    expect(mocks.authenticatedApiRequest).toHaveBeenCalledWith(
      `/organizations/creator-studio/projects/${projectId}/media/uploads`,
      {
        body: JSON.stringify({
          contentType: 'video/mp4',
          fileName: 'sermon.mp4',
          sizeBytes: 1_024,
        }),
        method: 'POST',
      },
    );
  });

  it('verifies completion and revalidates the project', async () => {
    mocks.authenticatedApiRequest.mockResolvedValueOnce({ id: mediaId });

    await expect(
      completeSourceVideoUpload({
        mediaId,
        organizationSlug: 'creator-studio',
        projectId,
      }),
    ).resolves.toEqual({ data: { id: mediaId } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/organizations/creator-studio/projects/${projectId}`,
    );
  });
});
