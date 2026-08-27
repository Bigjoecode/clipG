import { ForbiddenException } from '@nestjs/common';

import type { OrganizationRole } from '@clipgenius/types';

export function assertCanDeleteProject(role: OrganizationRole): void {
  if (role === 'MEMBER') {
    throw new ForbiddenException(
      'Organization administration is required to delete a project.',
    );
  }
}
