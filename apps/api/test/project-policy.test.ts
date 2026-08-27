import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { assertCanDeleteProject } from '../src/projects/project-policy.js';

describe('project policy', () => {
  it.each(['OWNER', 'ADMIN'] as const)(
    'allows %s to permanently delete a project',
    (role) => {
      expect(() => assertCanDeleteProject(role)).not.toThrow();
    },
  );

  it('prevents a member from permanently deleting a project', () => {
    expect(() => assertCanDeleteProject('MEMBER')).toThrow(ForbiddenException);
  });
});
