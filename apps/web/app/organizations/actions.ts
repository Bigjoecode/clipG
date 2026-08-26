'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ApiRequestError, authenticatedApiRequest } from '../../lib/api';

import type {
  OrganizationMember,
  OrganizationSummary,
} from '@clipgenius/types';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(120).optional(),
});
const updateSchema = createSchema.extend({ currentSlug: z.string().min(1) });
const memberSchema = z.object({
  organizationSlug: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  userId: z.uuid(),
});
const removeMemberSchema = memberSchema.omit({ role: true });

function organizationRedirect(slug: string | null, message: string): never {
  const path =
    slug === null
      ? '/organizations'
      : `/organizations/${encodeURIComponent(slug)}`;
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createOrganization(formData: FormData): Promise<never> {
  const result = createSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
  });
  if (!result.success) {
    organizationRedirect(null, 'Enter a valid organization name and slug.');
  }

  try {
    const organization = await authenticatedApiRequest<OrganizationSummary>(
      '/organizations',
      { body: JSON.stringify(result.data), method: 'POST' },
    );
    revalidatePath('/organizations');
    redirect(`/organizations/${organization.slug}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      organizationRedirect(null, error.message);
    }
    throw error;
  }
}

export async function updateOrganization(formData: FormData): Promise<never> {
  const result = updateSchema.safeParse({
    currentSlug: formData.get('currentSlug'),
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
  });
  if (!result.success) {
    organizationRedirect(null, 'Enter valid organization details.');
  }

  try {
    const organization = await authenticatedApiRequest<OrganizationSummary>(
      `/organizations/${encodeURIComponent(result.data.currentSlug)}`,
      {
        body: JSON.stringify({
          name: result.data.name,
          slug: result.data.slug,
        }),
        method: 'PATCH',
      },
    );
    revalidatePath('/organizations');
    redirect(`/organizations/${organization.slug}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      organizationRedirect(result.data.currentSlug, error.message);
    }
    throw error;
  }
}

export async function deleteOrganization(formData: FormData): Promise<never> {
  const slug = z.string().min(1).safeParse(formData.get('slug'));
  if (!slug.success) {
    organizationRedirect(null, 'Organization slug is missing.');
  }
  try {
    await authenticatedApiRequest<void>(
      `/organizations/${encodeURIComponent(slug.data)}`,
      { method: 'DELETE' },
    );
    revalidatePath('/organizations');
    redirect('/organizations');
  } catch (error) {
    if (error instanceof ApiRequestError) {
      organizationRedirect(slug.data, error.message);
    }
    throw error;
  }
}

export async function updateMemberRole(formData: FormData): Promise<never> {
  const result = memberSchema.safeParse({
    organizationSlug: formData.get('organizationSlug'),
    role: formData.get('role'),
    userId: formData.get('userId'),
  });
  if (!result.success) {
    organizationRedirect(null, 'Member update is invalid.');
  }
  try {
    await authenticatedApiRequest<OrganizationMember>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/members/${encodeURIComponent(result.data.userId)}`,
      { body: JSON.stringify({ role: result.data.role }), method: 'PATCH' },
    );
    revalidatePath(`/organizations/${result.data.organizationSlug}`);
    redirect(`/organizations/${result.data.organizationSlug}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      organizationRedirect(result.data.organizationSlug, error.message);
    }
    throw error;
  }
}

export async function removeMember(formData: FormData): Promise<never> {
  const result = removeMemberSchema.safeParse({
    organizationSlug: formData.get('organizationSlug'),
    userId: formData.get('userId'),
  });
  if (!result.success) {
    organizationRedirect(null, 'Member removal is invalid.');
  }
  try {
    await authenticatedApiRequest<void>(
      `/organizations/${encodeURIComponent(result.data.organizationSlug)}/members/${encodeURIComponent(result.data.userId)}`,
      { method: 'DELETE' },
    );
    revalidatePath(`/organizations/${result.data.organizationSlug}`);
    redirect(`/organizations/${result.data.organizationSlug}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      organizationRedirect(result.data.organizationSlug, error.message);
    }
    throw error;
  }
}
