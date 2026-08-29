'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  ApiRequestError,
  authenticatedApiRequest,
} from '../../../../../lib/api';

import type {
  MediaAssetSummary,
  SourceVideoUploadSession,
} from '@clipgenius/types';

const locationSchema = z.object({
  organizationSlug: z.string().min(1),
  projectId: z.uuid(),
});
const initiateSchema = locationSchema.extend({
  contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});
const completeSchema = locationSchema.extend({ mediaId: z.uuid() });

/**
 * `authenticatedApiRequest` redirects to the login page by throwing Next's
 * redirect signal. Swallowing it would replace the sign-in with a generic error
 * message, so anything that is not a real API failure is re-thrown.
 */
function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  throw error;
}

export type UploadActionResult<T> =
  | { readonly data: T; readonly error?: never }
  | { readonly data?: never; readonly error: string };

export async function initiateSourceVideoUpload(
  input: unknown,
): Promise<UploadActionResult<SourceVideoUploadSession>> {
  const result = initiateSchema.safeParse(input);
  if (!result.success) {
    return { error: 'Choose a valid MP4, MOV, or WebM video.' };
  }
  try {
    const data = await authenticatedApiRequest<SourceVideoUploadSession>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}/media/uploads`,
      {
        body: JSON.stringify({
          contentType: result.data.contentType,
          fileName: result.data.fileName,
          sizeBytes: result.data.sizeBytes,
        }),
        method: 'POST',
      },
    );
    return { data };
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
}

export async function completeSourceVideoUpload(
  input: unknown,
): Promise<UploadActionResult<MediaAssetSummary>> {
  const result = completeSchema.safeParse(input);
  if (!result.success) {
    return { error: 'Upload verification details are invalid.' };
  }
  try {
    const data = await authenticatedApiRequest<MediaAssetSummary>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}/media/${encodeURIComponent(result.data.mediaId)}/complete`,
      { method: 'POST' },
    );
    revalidatePath(
      `/organizations/${result.data.organizationSlug}/projects/${result.data.projectId}`,
    );
    return { data };
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
}

export async function failSourceVideoUpload(
  input: unknown,
): Promise<UploadActionResult<MediaAssetSummary>> {
  const result = completeSchema.safeParse(input);
  if (!result.success) {
    return { error: 'Upload failure details are invalid.' };
  }
  try {
    const data = await authenticatedApiRequest<MediaAssetSummary>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}/media/${encodeURIComponent(result.data.mediaId)}/fail`,
      { method: 'POST' },
    );
    revalidatePath(
      `/organizations/${result.data.organizationSlug}/projects/${result.data.projectId}`,
    );
    return { data };
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
}

/**
 * Form action used by the project page's "Retry analysis" button. It reports the
 * outcome through the page's notice banner rather than returning a value,
 * matching the other project lifecycle actions.
 */
export async function retrySourceVideoAnalysis(
  formData: FormData,
): Promise<never> {
  const result = completeSchema.safeParse({
    mediaId: formData.get('mediaId'),
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
  });
  if (!result.success) {
    redirect('/organizations?error=Choose+a+valid+video+to+analyze.');
  }

  const path = `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`;
  const notice = 'Analysis queued. Refresh in a moment to see the result.';
  try {
    await authenticatedApiRequest<MediaAssetSummary>(
      `${path}/media/${encodeURIComponent(result.data.mediaId)}/probe`,
      { method: 'POST' },
    );
  } catch (error) {
    const message = apiErrorMessage(error);
    revalidatePath(path);
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent(notice)}`);
}

export async function requestSourceVideoTranscription(
  formData: FormData,
): Promise<never> {
  const result = completeSchema.safeParse({
    mediaId: formData.get('mediaId'),
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
  });
  if (!result.success) {
    redirect('/organizations?error=Choose+a+valid+video+to+transcribe.');
  }

  const path = `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`;
  try {
    await authenticatedApiRequest<MediaAssetSummary>(
      `${path}/media/${encodeURIComponent(result.data.mediaId)}/transcribe`,
      { method: 'POST' },
    );
  } catch (error) {
    const message = apiErrorMessage(error);
    revalidatePath(path);
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(path);
  redirect(
    `${path}?message=${encodeURIComponent('Transcription queued. Refresh in a moment to see the result.')}`,
  );
}

export async function requestContentIntelligence(
  formData: FormData,
): Promise<never> {
  const result = completeSchema.safeParse({
    mediaId: formData.get('mediaId'),
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
  });
  if (!result.success) {
    redirect('/organizations?error=Choose+a+valid+transcript+to+analyze.');
  }

  const path = `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`;
  try {
    await authenticatedApiRequest<MediaAssetSummary>(
      `${path}/media/${encodeURIComponent(result.data.mediaId)}/analyze-content`,
      {
        body: JSON.stringify({
          replaceExisting: formData.get('replaceExisting') === 'true',
        }),
        method: 'POST',
      },
    );
  } catch (error) {
    const message = apiErrorMessage(error);
    revalidatePath(path);
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(path);
  redirect(
    `${path}?message=${encodeURIComponent('Content intelligence queued. Refresh in a moment to see the result.')}`,
  );
}
