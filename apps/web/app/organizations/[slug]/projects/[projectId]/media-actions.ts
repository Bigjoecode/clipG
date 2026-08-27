'use server';

import { revalidatePath } from 'next/cache';
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
    return {
      error:
        error instanceof ApiRequestError
          ? error.message
          : 'Could not prepare the video upload.',
    };
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
    return {
      error:
        error instanceof ApiRequestError
          ? error.message
          : 'Could not verify the completed upload.',
    };
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
    return {
      error:
        error instanceof ApiRequestError
          ? error.message
          : 'Could not record the interrupted upload.',
    };
  }
}
