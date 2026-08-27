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

export const projectStatuses = ['ACTIVE', 'ARCHIVED'] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export interface ProjectSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly createdById: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const mediaKinds = ['SOURCE_VIDEO'] as const;
export const mediaStatuses = ['UPLOAD_PENDING', 'UPLOADED', 'FAILED'] as const;

export type MediaKind = (typeof mediaKinds)[number];
export type MediaStatus = (typeof mediaStatuses)[number];

export interface MediaAssetSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly uploadedById: string | null;
  readonly kind: MediaKind;
  readonly status: MediaStatus;
  readonly originalName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResumableUploadTarget {
  readonly protocol: 'tus';
  readonly endpoint: string;
  readonly token: string;
  readonly bucket: string;
  readonly key: string;
  readonly chunkSizeBytes: number;
  readonly expiresAt: string;
}

export interface SourceVideoUploadSession {
  readonly media: MediaAssetSummary;
  readonly upload: ResumableUploadTarget;
}
