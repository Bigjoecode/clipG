import {
  type PrismaClient,
  type Project as DatabaseProject,
  type ProjectStatus as DatabaseProjectStatus,
} from '@clipgenius/database';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DATABASE_CLIENT } from '../database/database.module.js';
import { normalizeOrganizationSlug } from '../organizations/organizations.service.js';
import { assertCanDeleteProject } from './project-policy.js';

import type {
  CreateProjectInput,
  UpdateProjectInput,
} from './project.schemas.js';
import type {
  AuthenticatedUser,
  ProjectStatus,
  ProjectSummary,
} from '@clipgenius/types';

function asProjectStatus(status: DatabaseProjectStatus): ProjectStatus {
  return status;
}

@Injectable()
export class ProjectsService {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  public async create(
    actor: AuthenticatedUser,
    organizationSlug: string,
    input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    const membership = await this.accessibleOrganization(
      actor.id,
      organizationSlug,
    );
    const project = await this.database.project.create({
      data: {
        createdById: actor.id,
        description: input.description ?? null,
        name: input.name,
        organizationId: membership.organizationId,
      },
    });
    return this.toSummary(project);
  }

  public async list(
    actor: AuthenticatedUser,
    organizationSlug: string,
  ): Promise<readonly ProjectSummary[]> {
    const membership = await this.accessibleOrganization(
      actor.id,
      organizationSlug,
    );
    const projects = await this.database.project.findMany({
      orderBy: { updatedAt: 'desc' },
      where: { organizationId: membership.organizationId },
    });
    return projects.map((project) => this.toSummary(project));
  }

  public async get(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
  ): Promise<ProjectSummary> {
    return this.toSummary(
      await this.accessibleProject(actor.id, organizationSlug, projectId),
    );
  }

  public async update(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary> {
    const project = await this.accessibleProject(
      actor.id,
      organizationSlug,
      projectId,
    );
    const updated = await this.database.project.update({
      data: {
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      where: { id: project.id },
    });
    return this.toSummary(updated);
  }

  public async delete(
    actor: AuthenticatedUser,
    organizationSlug: string,
    projectId: string,
  ): Promise<void> {
    const membership = await this.accessibleOrganization(
      actor.id,
      organizationSlug,
    );
    assertCanDeleteProject(membership.role);
    this.assertProjectId(projectId);
    const project = await this.database.project.findFirst({
      select: { id: true },
      where: { id: projectId, organizationId: membership.organizationId },
    });
    if (project === null) {
      throw new NotFoundException('Project not found.');
    }
    await this.database.project.delete({ where: { id: project.id } });
  }

  private async accessibleOrganization(userId: string, slugValue: string) {
    const membership = await this.database.organizationMembership.findFirst({
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

  private async accessibleProject(
    userId: string,
    organizationSlug: string,
    projectId: string,
  ): Promise<DatabaseProject> {
    this.assertProjectId(projectId);
    const membership = await this.accessibleOrganization(
      userId,
      organizationSlug,
    );
    const project = await this.database.project.findFirst({
      where: { id: projectId, organizationId: membership.organizationId },
    });
    if (project === null) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  private assertProjectId(projectId: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    ) {
      throw new BadRequestException('Project id must be a UUID.');
    }
  }

  private toSummary(project: DatabaseProject): ProjectSummary {
    return {
      createdAt: project.createdAt.toISOString(),
      createdById: project.createdById,
      description: project.description,
      id: project.id,
      name: project.name,
      organizationId: project.organizationId,
      status: asProjectStatus(project.status),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
