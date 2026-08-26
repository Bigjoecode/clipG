import Link from 'next/link';

import { logout } from '../auth/actions';
import { authenticatedApiRequest } from '../../lib/api';
import { createOrganization } from './actions';

import type { OrganizationSummary } from '@clipgenius/types';

interface OrganizationsPageProps {
  readonly searchParams: Promise<{ readonly error?: string }>;
}

export default async function OrganizationsPage({
  searchParams,
}: OrganizationsPageProps) {
  const [{ error }, organizations] = await Promise.all([
    searchParams,
    authenticatedApiRequest<readonly OrganizationSummary[]>('/organizations'),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between">
        <Link className="font-semibold" href="/">
          ClipGenius
        </Link>
        <form action={logout}>
          <button
            className="text-sm text-zinc-400 hover:text-white"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Organizations
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Your workspaces
          </h1>
          <div className="mt-8 space-y-3">
            {organizations.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 p-6 text-zinc-400">
                Create your first organization to establish a secure workspace.
              </p>
            ) : (
              organizations.map((organization) => (
                <Link
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-violet-700"
                  href={`/organizations/${organization.slug}`}
                  key={organization.id}
                >
                  <span>
                    <span className="block font-semibold">
                      {organization.name}
                    </span>
                    <span className="mt-1 block text-sm text-zinc-500">
                      /{organization.slug}
                    </span>
                  </span>
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {organization.role}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Create organization</h2>
          {error === undefined ? null : (
            <p className="mt-4 text-sm text-red-300">{error}</p>
          )}
          <form action={createOrganization} className="mt-6 space-y-4">
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
              Slug <span className="text-zinc-500">(optional)</span>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                maxLength={120}
                name="slug"
              />
            </label>
            <button
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500"
              type="submit"
            >
              Create workspace
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}
