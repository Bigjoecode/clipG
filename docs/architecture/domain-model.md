# Identity and Tenancy Domain Model

## Scope

Task 002 introduced the persistence model required by Task 003: users, organizations, and organization memberships. Task 004 added organization-owned project metadata. Task 005 adds source-media metadata and upload lifecycle state. Subscriptions, usage, transcripts, AI runs, jobs, renders, and publishing records remain deferred to their milestones.

## Relationship model

```text
User
  1
  |
  | many
  v
OrganizationMembership
  ^
  | many
  |
  1
Organization
```

Task 004 extends the tenant relationship without changing its identity model:

```text
Organization 1 -> many Project
User         1 -> many Project (creator audit reference, nullable)
Project      1 -> many MediaAsset
User         1 -> many MediaAsset (uploader audit reference, nullable)
```

A user can belong to many organizations and an organization can contain many users. `OrganizationMembership` is a first-class entity because role, lifecycle, invitations, and future audit behavior belong to the relationship rather than either parent.

## Entities

### User

`User` is the application-owned identity record. It contains a UUID primary key, unique email, optional profile fields, optional verification timestamp, and audit timestamps.

Task 003 maps the verified Supabase `sub` UUID to `User.id`. The identifier remains a generic UUID, email is never used for implicit account linking, and Supabase verification remains behind an API provider boundary. A future multi-provider requirement should introduce a first-class external-identity table through its own migration.

### Organization

`Organization` is the tenant boundary for ClipGenius data. It has a UUID primary key, display name, globally unique slug, and audit timestamps. Future organization-owned records must carry an `organizationId` and authorize access through membership.

### OrganizationMembership

Membership joins a user to an organization with one of three roles:

- `OWNER`: full organization control;
- `ADMIN`: organization administration without ownership semantics; and
- `MEMBER`: standard access.

The database guarantees that a user has at most one membership per organization. An index on `userId` supports listing a user's organizations. Memberships are deleted if either parent is deleted.

### Project

`Project` is the organization-owned workspace for one future content-production effort. Task 004 stores only its UUID, organization, optional creator audit reference, name, optional description, active/archived lifecycle, and timestamps. It deliberately does not contain source media, upload, transcript, Edit Plan, job, render, or AI state.

Archiving is the normal reversible lifecycle action. Hard deletion is an explicit destructive action restricted by the API to organization owners and administrators. Deleting an organization deletes its projects; deleting a creator preserves the project and clears only the audit reference.

### MediaAsset

`MediaAsset` records immutable source-video provenance and the expected object metadata without storing media bytes in PostgreSQL. Task 005 records organization, project, optional uploader, original name, validated MIME type and size, provider/bucket/key, upload status, failure reason, and timestamps.

Upload status is limited to `UPLOAD_PENDING`, `UPLOADED`, and `FAILED`. The API creates a pending record before issuing a direct-storage upload target, then verifies the stored object's exact size and content type before marking it uploaded. Later processing state does not belong in this upload lifecycle enum.

## Invariants

Database-enforced invariants:

- primary keys are PostgreSQL UUIDs;
- user emails are unique;
- organization slugs are unique;
- membership roles are limited to the PostgreSQL `organization_role` enum;
- a user cannot have duplicate membership in an organization;
- memberships cannot outlive their user or organization;
- projects cannot outlive their organization;
- a deleted creator does not delete organization-owned projects;
- project status is limited to the PostgreSQL `project_status` enum;
- media assets cannot outlive their organization or project;
- a deleted uploader does not delete organization-owned media metadata;
- storage object identities are unique per provider, bucket, and key; and
- media kind and upload status are limited to database enums.

Application-enforced invariants for Task 003:

- normalize and validate email before persistence;
- normalize and validate organization slugs;
- create an organization and its owner membership atomically;
- prevent removal or demotion of the last owner;
- authorize role changes and organization deletion; and
- map authenticated provider identities to application users.

Application-enforced invariants for Task 004:

- authorize every project operation through current organization membership;
- prevent cross-organization project discovery and mutation;
- allow members to create, read, update, archive, and restore projects; and
- restrict permanent project deletion to organization owners and administrators.

Application-enforced invariants for Task 005:

- authorize upload initiation, listing, and completion through project membership;
- accept only configured video MIME types and bounded file sizes;
- keep user filenames out of storage paths and generate unpredictable object keys;
- stream video bytes directly from the browser to object storage;
- verify stored size and content type before declaring upload success; and
- preserve source objects rather than overwriting a prior upload path.

These rules require transaction context and actor authorization, so encoding partial versions as schema defaults would provide false safety.

## Naming and timestamps

Prisma models and fields use TypeScript-friendly PascalCase/camelCase. PostgreSQL tables and columns use plural snake_case names through explicit mappings. Timestamps use `TIMESTAMPTZ(3)` so values represent absolute instants with millisecond precision.

Prisma manages `updatedAt` during writes. Code that updates tables outside Prisma must set `updated_at` explicitly.

## Database client lifecycle

`@clipgenius/database` exports `createDatabaseClient`, which creates a Prisma 7 client backed by `@prisma/adapter-pg`. Callers own the returned client's lifecycle and must call `$disconnect()` during application shutdown. The factory sets a bounded connection timeout and pool size, both of which can be overridden by the caller.

The package does not export a process-global singleton because API processes, workers, scripts, and tests have different lifecycle requirements.

## Migration workflow

For local development:

```bash
pnpm services:up
pnpm db:migrate
```

For deployment:

```bash
pnpm db:migrate:deploy
```

Migration history is committed under `packages/database/prisma/migrations`. Never edit an applied migration; add a new migration for later schema changes.
