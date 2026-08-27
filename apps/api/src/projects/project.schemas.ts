import { projectStatuses } from '@clipgenius/types';
import { z } from 'zod';

const projectName = z.string().trim().min(2).max(120);
const projectDescription = z.string().trim().max(2_000).nullable();

export const createProjectSchema = z
  .object({
    description: projectDescription.optional(),
    name: projectName,
  })
  .strict();

export const updateProjectSchema = z
  .object({
    description: projectDescription.optional(),
    name: projectName.optional(),
    status: z.enum(projectStatuses).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.description !== undefined ||
      value.name !== undefined ||
      value.status !== undefined,
    { message: 'At least one project field is required.' },
  );

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
