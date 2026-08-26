import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { OrganizationRole } from '@clipgenius/types';

export function assertCanManageOrganization(role: OrganizationRole): void {
  if (role === 'MEMBER') {
    throw new ForbiddenException('Organization administration is required.');
  }
}

export function assertCanDeleteOrganization(role: OrganizationRole): void {
  if (role !== 'OWNER') {
    throw new ForbiddenException('Only an owner can delete an organization.');
  }
}

export function assertCanChangeMemberRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  nextRole: OrganizationRole,
  ownerCount: number,
): void {
  if (actorRole !== 'OWNER') {
    throw new ForbiddenException('Only an owner can change member roles.');
  }

  if (targetRole === 'OWNER' && nextRole !== 'OWNER' && ownerCount <= 1) {
    throw new ConflictException(
      'An organization must retain at least one owner.',
    );
  }
}

export function assertCanRemoveMember(
  actorId: string,
  actorRole: OrganizationRole,
  targetId: string,
  targetRole: OrganizationRole,
  ownerCount: number,
): void {
  const isLeaving = actorId === targetId;

  if (!isLeaving) {
    const canRemove =
      actorRole === 'OWNER' ||
      (actorRole === 'ADMIN' && targetRole === 'MEMBER');
    if (!canRemove) {
      throw new ForbiddenException(
        'You cannot remove this organization member.',
      );
    }
  }

  if (targetRole === 'OWNER' && ownerCount <= 1) {
    throw new ConflictException(
      'An organization must retain at least one owner.',
    );
  }
}
