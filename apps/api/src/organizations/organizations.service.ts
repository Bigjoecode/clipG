import {
  Prisma,
  type PrismaClient,
  type OrganizationRole as DatabaseOrganizationRole,
} from '@clipgenius/database';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DATABASE_CLIENT } from '../database/database.module.js';
import {
  assertCanChangeMemberRole,
  assertCanDeleteOrganization,
  assertCanManageOrganization,
  assertCanRemoveMember,
} from './organization-policy.js';

import type {
  CreateOrganizationInput,
  UpdateMemberRoleInput,
  UpdateOrganizationInput,
} from './organization.schemas.js';
import type {
  AuthenticatedUser,
  OrganizationDetail,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
} from '@clipgenius/types';

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeOrganizationSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63)
    .replace(/-+$/g, '');

  if (!slugPattern.test(slug)) {
    throw new BadRequestException(
      'Choose a slug containing letters, numbers, or hyphens.',
    );
  }

  return slug;
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function asOrganizationRole(role: DatabaseOrganizationRole): OrganizationRole {
  return role;
}

@Injectable()
export class OrganizationsService {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  public async create(
    actor: AuthenticatedUser,
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary> {
    const slug = normalizeOrganizationSlug(input.slug ?? input.name);

    try {
      const membership = await this.database.$transaction(
        async (transaction) => {
          const organization = await transaction.organization.create({
            data: { name: input.name, slug },
          });
          return transaction.organizationMembership.create({
            data: {
              organizationId: organization.id,
              role: 'OWNER',
              userId: actor.id,
            },
            include: { organization: true },
          });
        },
      );

      return this.toSummary(membership.organization, membership.role);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'That organization slug is already in use.',
        );
      }
      throw error;
    }
  }

  public async list(
    actor: AuthenticatedUser,
  ): Promise<readonly OrganizationSummary[]> {
    const memberships = await this.database.organizationMembership.findMany({
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
      where: { userId: actor.id },
    });

    return memberships.map((membership) =>
      this.toSummary(membership.organization, membership.role),
    );
  }

  public async get(
    actor: AuthenticatedUser,
    slugValue: string,
  ): Promise<OrganizationDetail> {
    const membership = await this.accessibleMembership(actor.id, slugValue);
    const members = await this.membersForOrganization(
      membership.organizationId,
    );

    return {
      ...this.toSummary(membership.organization, membership.role),
      members,
    };
  }

  public async update(
    actor: AuthenticatedUser,
    slugValue: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationSummary> {
    const membership = await this.accessibleMembership(actor.id, slugValue);
    assertCanManageOrganization(asOrganizationRole(membership.role));

    try {
      const organization = await this.database.organization.update({
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined
            ? {}
            : { slug: normalizeOrganizationSlug(input.slug) }),
        },
        where: { id: membership.organizationId },
      });
      return this.toSummary(organization, membership.role);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'That organization slug is already in use.',
        );
      }
      throw error;
    }
  }

  public async delete(
    actor: AuthenticatedUser,
    slugValue: string,
  ): Promise<void> {
    const membership = await this.accessibleMembership(actor.id, slugValue);
    assertCanDeleteOrganization(asOrganizationRole(membership.role));
    await this.database.organization.delete({
      where: { id: membership.organizationId },
    });
  }

  public async listMembers(
    actor: AuthenticatedUser,
    slugValue: string,
  ): Promise<readonly OrganizationMember[]> {
    const membership = await this.accessibleMembership(actor.id, slugValue);
    return this.membersForOrganization(membership.organizationId);
  }

  public async updateMemberRole(
    actor: AuthenticatedUser,
    slugValue: string,
    targetUserId: string,
    input: UpdateMemberRoleInput,
  ): Promise<OrganizationMember> {
    this.assertUserId(targetUserId);
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const organization = await transaction.organization.findUnique({
            select: { id: true },
            where: { slug: normalizeOrganizationSlug(slugValue) },
          });
          if (organization === null) {
            throw new NotFoundException('Organization not found.');
          }

          const [actorMembership, targetMembership, ownerCount] =
            await Promise.all([
              transaction.organizationMembership.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId: organization.id,
                    userId: actor.id,
                  },
                },
              }),
              transaction.organizationMembership.findUnique({
                include: { user: true },
                where: {
                  organizationId_userId: {
                    organizationId: organization.id,
                    userId: targetUserId,
                  },
                },
              }),
              transaction.organizationMembership.count({
                where: { organizationId: organization.id, role: 'OWNER' },
              }),
            ]);

          if (actorMembership === null || targetMembership === null) {
            throw new NotFoundException('Organization member not found.');
          }

          assertCanChangeMemberRole(
            asOrganizationRole(actorMembership.role),
            asOrganizationRole(targetMembership.role),
            input.role,
            ownerCount,
          );

          const updated = await transaction.organizationMembership.update({
            data: { role: input.role },
            include: { user: true },
            where: { id: targetMembership.id },
          });
          return this.toMember(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'Membership changed concurrently. Please retry the request.',
        );
      }
      throw error;
    }
  }

  public async removeMember(
    actor: AuthenticatedUser,
    slugValue: string,
    targetUserId: string,
  ): Promise<void> {
    this.assertUserId(targetUserId);
    try {
      await this.database.$transaction(
        async (transaction) => {
          const organization = await transaction.organization.findUnique({
            select: { id: true },
            where: { slug: normalizeOrganizationSlug(slugValue) },
          });
          if (organization === null) {
            throw new NotFoundException('Organization not found.');
          }

          const [actorMembership, targetMembership, ownerCount] =
            await Promise.all([
              transaction.organizationMembership.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId: organization.id,
                    userId: actor.id,
                  },
                },
              }),
              transaction.organizationMembership.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId: organization.id,
                    userId: targetUserId,
                  },
                },
              }),
              transaction.organizationMembership.count({
                where: { organizationId: organization.id, role: 'OWNER' },
              }),
            ]);

          if (actorMembership === null || targetMembership === null) {
            throw new NotFoundException('Organization member not found.');
          }

          assertCanRemoveMember(
            actor.id,
            asOrganizationRole(actorMembership.role),
            targetUserId,
            asOrganizationRole(targetMembership.role),
            ownerCount,
          );
          await transaction.organizationMembership.delete({
            where: { id: targetMembership.id },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'Membership changed concurrently. Please retry the request.',
        );
      }
      throw error;
    }
  }

  private async accessibleMembership(userId: string, slugValue: string) {
    const membership = await this.database.organizationMembership.findFirst({
      include: { organization: true },
      where: {
        organization: { slug: normalizeOrganizationSlug(slugValue) },
        userId,
      },
    });
    if (membership === null) {
      throw new NotFoundException('Organization not found.');
    }
    return membership;
  }

  private assertUserId(userId: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId,
      )
    ) {
      throw new BadRequestException('Member user id must be a UUID.');
    }
  }

  private async membersForOrganization(
    organizationId: string,
  ): Promise<readonly OrganizationMember[]> {
    const memberships = await this.database.organizationMembership.findMany({
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      where: { organizationId },
    });
    return memberships.map((membership) => this.toMember(membership));
  }

  private toSummary(
    organization: {
      readonly id: string;
      readonly name: string;
      readonly slug: string;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    },
    role: DatabaseOrganizationRole,
  ): OrganizationSummary {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: asOrganizationRole(role),
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  private toMember(membership: {
    readonly id: string;
    readonly userId: string;
    readonly role: DatabaseOrganizationRole;
    readonly createdAt: Date;
    readonly user: {
      readonly email: string;
      readonly displayName: string | null;
      readonly avatarUrl: string | null;
    };
  }): OrganizationMember {
    return {
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      displayName: membership.user.displayName,
      avatarUrl: membership.user.avatarUrl,
      role: asOrganizationRole(membership.role),
      createdAt: membership.createdAt.toISOString(),
    };
  }
}
