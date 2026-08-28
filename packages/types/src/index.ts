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
  readonly metadata: MediaTechnicalMetadata | null;
  readonly probe: MediaJobSummary | null;
  readonly transcript: TranscriptSummary | null;
  readonly transcription: MediaJobSummary | null;
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

export const mediaJobTypes = ['MEDIA_PROBE', 'TRANSCRIPTION'] as const;
export const mediaJobStatuses = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type MediaJobType = (typeof mediaJobTypes)[number];
export type MediaJobStatus = (typeof mediaJobStatuses)[number];

export interface MediaTechnicalMetadata {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly frameRate: number | null;
  readonly bitRate: number | null;
  readonly hasAudio: boolean;
}

export interface MediaJobSummary {
  readonly id: string;
  readonly type: MediaJobType;
  readonly status: MediaJobStatus;
  readonly attempts: number;
  readonly failureReason: string | null;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/**
 * Queue name shared by the API producer and the worker consumer. Changing it
 * orphans jobs that are already waiting in Redis.
 */
export const mediaProbeQueueName = 'media-probe';

/**
 * Payload carried through BullMQ. It deliberately holds identifiers only: the
 * worker re-reads authoritative state from PostgreSQL so a replayed or stale
 * message can never resurrect deleted media or bypass tenancy.
 */
export interface MediaProbeJobData {
  readonly mediaJobId: string;
  readonly mediaAssetId: string;
  readonly organizationId: string;
  readonly projectId: string;
}

export const transcriptionQueueName = 'transcription';

export interface TranscriptionJobData {
  readonly mediaJobId: string;
  readonly mediaAssetId: string;
  readonly organizationId: string;
  readonly projectId: string;
}

export interface TranscriptSummary {
  readonly id: string;
  readonly language: string | null;
  readonly provider: string;
  readonly model: string;
  readonly segmentCount: number;
  /**
   * Whether the provider attributed speech to speakers. A segment's `speaker`
   * being null is ambiguous on its own; this records the capability actually
   * exercised, so downstream analysis never has to infer it from missing data.
   */
  readonly diarized: boolean;
  readonly speakerCount: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TranscriptSegment {
  readonly id: string;
  readonly index: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly speaker: string | null;
  readonly text: string;
}

export interface TranscriptDetail extends TranscriptSummary {
  readonly organizationId: string;
  readonly projectId: string;
  readonly mediaAssetId: string;
  readonly originalName: string;
  readonly text: string;
  readonly durationSeconds: number | null;
  readonly segments: readonly TranscriptSegment[];
}
