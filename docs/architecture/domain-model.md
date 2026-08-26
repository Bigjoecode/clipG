# Identity and Tenancy Domain Model

## Scope

Task 002 introduces only the persistence model required by Task 003: users, organizations, and organization memberships. Projects, subscriptions, usage, media, transcripts, AI runs, jobs, renders, and publishing records remain deferred to their milestones.

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

A user can belong to many organizations and an organization can contain many users. `OrganizationMembership` is a first-class entity because role, lifecycle, invitations, and future audit behavior belong to the relationship rather than either parent.

## Entities

### User

`User` is the application-owned identity record. It contains a UUID primary key, unique email, optional profile fields, optional verification timestamp, and audit timestamps.

Authentication-provider identifiers are deliberately absent. Task 003 will decide how Supabase identities map to application users without making the core data model inseparable from one authentication vendor.

### Organization

`Organization` is the tenant boundary for ClipGenius data. It has a UUID primary key, display name, globally unique slug, and audit timestamps. Future organization-owned records must carry an `organizationId` and authorize access through membership.

### OrganizationMembership

Membership joins a user to an organization with one of three roles:

- `OWNER`: full organization control;
- `ADMIN`: organization administration without ownership semantics; and
- `MEMBER`: standard access.

The database guarantees that a user has at most one membership per organization. An index on `userId` supports listing a user's organizations. Memberships are deleted if either parent is deleted.

## Invariants

Database-enforced invariants:

- primary keys are PostgreSQL UUIDs;
- user emails are unique;
- organization slugs are unique;
- membership roles are limited to the PostgreSQL `organization_role` enum;
- a user cannot have duplicate membership in an organization; and
- memberships cannot outlive their user or organization.

Application-enforced invariants for Task 003:

- normalize and validate email before persistence;
- normalize and validate organization slugs;
- create an organization and its owner membership atomically;
- prevent removal or demotion of the last owner;
- authorize role changes and organization deletion; and
- map authenticated provider identities to application users.

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
