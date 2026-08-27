'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ApiRequestError, authenticatedApiRequest } from '../../../../lib/api';

import type { ProjectSummary } from '@clipgenius/types';

const createSchema = z.object({
  description: z.string().trim().max(2_000).optional(),
  name: z.string().trim().min(2).max(120),
  organizationSlug: z.string().min(1),
});
const projectSchema = z.object({
  organizationSlug: z.string().min(1),
  projectId: z.uuid(),
});
const updateSchema = createSchema.extend({ projectId: z.uuid() });
const statusSchema = projectSchema.extend({
  status: z.enum(['ACTIVE', 'ARCHIVED']),
});

function projectRedirect(
  organizationSlug: string | null,
  projectId: string | null,
  kind: 'error' | 'message',
  message: string,
): never {
  const base =
    organizationSlug === null
      ? '/organizations'
      : `/organizations/${encodeURIComponent(organizationSlug)}`;
  const path =
    projectId === null || organizationSlug === null
      ? base
      : `${base}/projects/${encodeURIComponent(projectId)}`;
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function createProject(formData: FormData): Promise<never> {
  const result = createSchema.safeParse({
    description: formData.get('description') || undefined,
    name: formData.get('name'),
    organizationSlug: formData.get('organizationSlug'),
  });
  if (!result.success) {
    const slug = String(formData.get('organizationSlug') ?? '');
    projectRedirect(
      slug === '' ? null : slug,
      null,
      'error',
      'Enter valid project details.',
    );
  }

  try {
    const project = await authenticatedApiRequest<ProjectSummary>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects`,
      {
        body: JSON.stringify({
          description: result.data.description ?? null,
          name: result.data.name,
        }),
        method: 'POST',
      },
    );
    revalidatePath(`/organizations/${result.data.organizationSlug}`);
    projectRedirect(
      result.data.organizationSlug,
      project.id,
      'message',
      'Project created successfully.',
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      projectRedirect(
        result.data.organizationSlug,
        null,
        'error',
        error.message,
      );
    }
    throw error;
  }
}

export async function updateProject(formData: FormData): Promise<never> {
  const result = updateSchema.safeParse({
    description: formData.get('description') || undefined,
    name: formData.get('name'),
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
  });
  if (!result.success) {
    const slug = String(formData.get('organizationSlug') ?? '');
    const projectId = String(formData.get('projectId') ?? '');
    projectRedirect(
      slug === '' ? null : slug,
      projectId === '' ? null : projectId,
      'error',
      'Enter valid project details.',
    );
  }

  try {
    await authenticatedApiRequest<ProjectSummary>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`,
      {
        body: JSON.stringify({
          description: result.data.description ?? null,
          name: result.data.name,
        }),
        method: 'PATCH',
      },
    );
    revalidatePath(
      `/organizations/${result.data.organizationSlug}/projects/${result.data.projectId}`,
    );
    projectRedirect(
      result.data.organizationSlug,
      result.data.projectId,
      'message',
      'Project saved successfully.',
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      projectRedirect(
        result.data.organizationSlug,
        result.data.projectId,
        'error',
        error.message,
      );
    }
    throw error;
  }
}

export async function setProjectStatus(formData: FormData): Promise<never> {
  const result = statusSchema.safeParse({
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
    status: formData.get('status'),
  });
  if (!result.success) {
    const slug = String(formData.get('organizationSlug') ?? '');
    const projectId = String(formData.get('projectId') ?? '');
    projectRedirect(
      slug === '' ? null : slug,
      projectId === '' ? null : projectId,
      'error',
      'Project status is invalid.',
    );
  }

  try {
    await authenticatedApiRequest<ProjectSummary>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`,
      { body: JSON.stringify({ status: result.data.status }), method: 'PATCH' },
    );
    revalidatePath(`/organizations/${result.data.organizationSlug}`);
    projectRedirect(
      result.data.organizationSlug,
      result.data.projectId,
      'message',
      result.data.status === 'ARCHIVED'
        ? 'Project archived successfully.'
        : 'Project restored successfully.',
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      projectRedirect(
        result.data.organizationSlug,
        result.data.projectId,
        'error',
        error.message,
      );
    }
    throw error;
  }
}

export async function deleteProject(formData: FormData): Promise<never> {
  const result = projectSchema.safeParse({
    organizationSlug: formData.get('organizationSlug'),
    projectId: formData.get('projectId'),
  });
  if (!result.success) {
    const slug = String(formData.get('organizationSlug') ?? '');
    const projectId = String(formData.get('projectId') ?? '');
    projectRedirect(
      slug === '' ? null : slug,
      projectId === '' ? null : projectId,
      'error',
      'Project details are invalid.',
    );
  }

  try {
    await authenticatedApiRequest<void>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/projects/${encodeURIComponent(result.data.projectId)}`,
      { method: 'DELETE' },
    );
    revalidatePath(`/organizations/${result.data.organizationSlug}`);
    projectRedirect(
      result.data.organizationSlug,
      null,
      'message',
      'Project deleted successfully.',
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      projectRedirect(
        result.data.organizationSlug,
        result.data.projectId,
        'error',
        error.message,
      );
    }
    throw error;
  }
}
