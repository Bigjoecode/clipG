import Link from 'next/link';

import { ActionNotice } from '../../../components/action-notice';
import { FormSubmitButton } from '../../../components/form-submit-button';
import { authenticatedApiRequest } from '../../../lib/api';
import {
  deleteOrganization,
  removeMember,
  updateMemberRole,
  updateOrganization,
} from '../actions';
import { createProject } from './projects/actions';

import type { OrganizationDetail, ProjectSummary } from '@clipgenius/types';

interface OrganizationPageProps {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<{
    readonly error?: string;
    readonly message?: string;
  }>;
}

export default async function OrganizationPage({
  params,
  searchParams,
}: OrganizationPageProps) {
  const [{ slug }, { error, message }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [organization, projects] = await Promise.all([
    authenticatedApiRequest<OrganizationDetail>(
      `/organizations/${encodeURIComponent(slug)}`,
    ),
    authenticatedApiRequest<readonly ProjectSummary[]>(
      `/organizations/${encodeURIComponent(slug)}/projects`,
    ),
  ]);
  const canManage =
    organization.role === 'OWNER' || organization.role === 'ADMIN';

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <Link className="text-sm text-violet-300" href="/organizations">
        ← Organizations
      </Link>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">/{organization.slug}</p>
          <h1 className="mt-2 text-4xl font-semibold">{organization.name}</h1>
        </div>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">
          {organization.role}
        </span>
      </div>
      <ActionNotice error={error} message={message} />

      <section className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <div className="mt-4 space-y-3">
            {projects.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 p-6 text-zinc-400">
                Create your first project to organize a content production.
              </p>
            ) : (
              projects.map((project) => (
                <Link
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-violet-700"
                  href={`/organizations/${organization.slug}/projects/${project.id}`}
                  key={project.id}
                >
                  <span>
                    <span className="block font-semibold">{project.name}</span>
                    <span className="mt-1 block text-sm text-zinc-500">
                      {project.description ?? 'No description'}
                    </span>
                  </span>
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {project.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Create project</h2>
          <form action={createProject} className="mt-6 space-y-4">
            <input
              name="organizationSlug"
              type="hidden"
              value={organization.slug}
            />
            <label className="block text-sm">
              Name
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="block text-sm">
              Description <span className="text-zinc-500">(optional)</span>
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                maxLength={2000}
                name="description"
              />
            </label>
            <FormSubmitButton
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500"
              label="Create project"
              pendingLabel="Creating project..."
            />
          </form>
        </aside>
      </section>

      {canManage ? (
        <section className="mt-10 rounded-2xl border border-zinc-800 p-6">
          <h2 className="font-semibold">Organization settings</h2>
          <form
            action={updateOrganization}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <input name="currentSlug" type="hidden" value={organization.slug} />
            <label className="text-sm">
              Name
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                defaultValue={organization.name}
                name="name"
                required
              />
            </label>
            <label className="text-sm">
              Slug
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                defaultValue={organization.slug}
                name="slug"
                required
              />
            </label>
            <FormSubmitButton
              className="rounded-xl bg-zinc-100 px-4 py-2 font-semibold text-zinc-950 sm:col-span-2"
              label="Save organization"
              pendingLabel="Saving organization..."
            />
          </form>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Members</h2>
        <div className="mt-4 divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
          {organization.members.map((member) => (
            <div
              className="flex flex-wrap items-center justify-between gap-4 p-5"
              key={member.id}
            >
              <div>
                <p className="font-medium">
                  {member.displayName ?? member.email}
                </p>
                <p className="text-sm text-zinc-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {organization.role === 'OWNER' ? (
                  <form action={updateMemberRole} className="flex gap-2">
                    <input
                      name="organizationSlug"
                      type="hidden"
                      value={organization.slug}
                    />
                    <input name="userId" type="hidden" value={member.userId} />
                    <select
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                      defaultValue={member.role}
                      name="role"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                    <FormSubmitButton
                      className="text-sm text-violet-300"
                      label="Update"
                      pendingLabel="Updating..."
                    />
                  </form>
                ) : (
                  <span className="text-sm text-zinc-400">{member.role}</span>
                )}
                {organization.role === 'OWNER' ||
                (organization.role === 'ADMIN' && member.role === 'MEMBER') ? (
                  <form action={removeMember}>
                    <input
                      name="organizationSlug"
                      type="hidden"
                      value={organization.slug}
                    />
                    <input name="userId" type="hidden" value={member.userId} />
                    <FormSubmitButton
                      className="text-sm text-red-300"
                      label="Remove"
                      pendingLabel="Removing..."
                    />
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {organization.role === 'OWNER' ? (
        <section className="mt-12 border-t border-zinc-800 pt-8">
          <form action={deleteOrganization}>
            <input name="slug" type="hidden" value={organization.slug} />
            <FormSubmitButton
              className="rounded-xl border border-red-900 px-4 py-2 text-sm text-red-300"
              label="Delete organization"
              pendingLabel="Deleting organization..."
            />
          </form>
        </section>
      ) : null}
    </main>
  );
}
