import { organizationRoles } from '@clipgenius/types';
import { z } from 'zod';

const organizationName = z.string().trim().min(2).max(120);
const organizationSlugInput = z.string().trim().min(1).max(120);

export const createOrganizationSchema = z
  .object({
    name: organizationName,
    slug: organizationSlugInput.optional(),
  })
  .strict();

export const updateOrganizationSchema = z
  .object({
    name: organizationName.optional(),
    slug: organizationSlugInput.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.slug !== undefined, {
    message: 'At least one organization field is required.',
  });

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(organizationRoles),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
