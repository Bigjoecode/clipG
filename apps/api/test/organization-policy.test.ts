import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  assertCanChangeMemberRole,
  assertCanRemoveMember,
} from '../src/organizations/organization-policy.js';
import { normalizeOrganizationSlug } from '../src/organizations/organizations.service.js';

describe('organization policy', () => {
  it('normalizes stable URL slugs', () => {
    expect(normalizeOrganizationSlug('  Créators & Company  ')).toBe(
      'creators-company',
    );
  });

  it('prevents demoting the last owner', () => {
    expect(() =>
      assertCanChangeMemberRole('OWNER', 'OWNER', 'ADMIN', 1),
    ).toThrow(ConflictException);
  });

  it('allows an owner transfer before the prior owner is demoted', () => {
    expect(() =>
      assertCanChangeMemberRole('OWNER', 'OWNER', 'ADMIN', 2),
    ).not.toThrow();
  });

  it('limits administrators to removing ordinary members', () => {
    expect(() =>
      assertCanRemoveMember('actor', 'ADMIN', 'target', 'OWNER', 2),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertCanRemoveMember('actor', 'ADMIN', 'target', 'MEMBER', 1),
    ).not.toThrow();
  });
});
