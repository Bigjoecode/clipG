export const serviceStatuses = ['ok', 'degraded', 'error'] as const;

export type ServiceStatus = (typeof serviceStatuses)[number];

export interface ServiceHealth {
  readonly status: ServiceStatus;
  readonly service: string;
}

export const organizationRoles = ['OWNER', 'ADMIN', 'MEMBER'] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: OrganizationRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrganizationMember {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly role: OrganizationRole;
  readonly createdAt: string;
}

export interface OrganizationDetail extends OrganizationSummary {
  readonly members: readonly OrganizationMember[];
}
