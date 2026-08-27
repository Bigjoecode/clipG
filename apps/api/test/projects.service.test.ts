import type { PrismaClient } from '@clipgenius/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectsService } from '../src/projects/projects.service.js';

const actor = {
  avatarUrl: null,
  displayName: 'Creator',
  email: 'creator@example.com',
  id: 'ff2b9fef-ec23-48f2-a7bd-8e9c75edbb44',
} as const;

const project = {
  createdAt: new Date('2026-08-27T12:00:00.000Z'),
  createdById: actor.id,
  description: 'Weekly teaching project',
  id: '5ea74442-0c18-4e90-a009-300fa2f39cbd',
  name: 'Sunday Sermon',
  organizationId: '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29',
  status: 'ACTIVE' as const,
  updatedAt: new Date('2026-08-27T12:00:00.000Z'),
};

describe('ProjectsService', () => {
  const findMembership = vi.fn();
  const createProject = vi.fn();
  const findProject = vi.fn();
  const deleteProject = vi.fn();
  const database = {
    organizationMembership: { findFirst: findMembership },
    project: {
      create: createProject,
      delete: deleteProject,
      findFirst: findProject,
    },
  } as unknown as PrismaClient;
  const service = new ProjectsService(database);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a project inside an organization the actor belongs to', async () => {
    findMembership.mockResolvedValueOnce({
      organizationId: project.organizationId,
      role: 'MEMBER',
    });
    createProject.mockResolvedValueOnce(project);

    await expect(
      service.create(actor, 'creator-studio', {
        description: project.description,
        name: project.name,
      }),
    ).resolves.toEqual({
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });
    expect(createProject).toHaveBeenCalledWith({
      data: {
        createdById: actor.id,
        description: project.description,
        name: project.name,
        organizationId: project.organizationId,
      },
    });
  });

  it('does not reveal a project outside the actor organization', async () => {
    findMembership.mockResolvedValueOnce({
      organizationId: project.organizationId,
      role: 'MEMBER',
    });
    findProject.mockResolvedValueOnce(null);

    await expect(
      service.get(actor, 'creator-studio', project.id),
    ).rejects.toThrow(NotFoundException);
    expect(findProject).toHaveBeenCalledWith({
      where: { id: project.id, organizationId: project.organizationId },
    });
  });

  it('prevents members from permanently deleting projects', async () => {
    findMembership.mockResolvedValueOnce({
      organizationId: project.organizationId,
      role: 'MEMBER',
    });

    await expect(
      service.delete(actor, 'creator-studio', project.id),
    ).rejects.toThrow(ForbiddenException);
    expect(findProject).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
