import Link from 'next/link';

import { ActionNotice } from '../../../../../components/action-notice';
import { FormSubmitButton } from '../../../../../components/form-submit-button';
import { MediaAnalysis } from '../../../../../components/media-analysis';
import { authenticatedApiRequest } from '../../../../../lib/api';
import { deleteProject, setProjectStatus, updateProject } from '../actions';
import {
  requestSourceVideoTranscription,
  retrySourceVideoAnalysis,
} from './media-actions';
import { SourceVideoUploader } from './source-video-uploader';

import type {
  MediaAssetSummary,
  OrganizationDetail,
  ProjectSummary,
} from '@clipgenius/types';

interface ProjectPageProps {
  readonly params: Promise<{
    readonly projectId: string;
    readonly slug: string;
  }>;
  readonly searchParams: Promise<{
    readonly error?: string;
    readonly message?: string;
  }>;
}

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const [{ projectId, slug }, { error, message }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [organization, project, mediaAssets] = await Promise.all([
    authenticatedApiRequest<OrganizationDetail>(
      `/organizations/${encodeURIComponent(slug)}`,
    ),
    authenticatedApiRequest<ProjectSummary>(
      `/organizations/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`,
    ),
    authenticatedApiRequest<readonly MediaAssetSummary[]>(
      `/organizations/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/media`,
    ),
  ]);
  const canDelete =
    organization.role === 'OWNER' || organization.role === 'ADMIN';
  const nextStatus = project.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <Link
        className="text-sm text-violet-300"
        href={`/organizations/${organization.slug}`}
      >
        ← {organization.name}
      </Link>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Project
          </p>
          <h1 className="mt-2 text-4xl font-semibold">{project.name}</h1>
        </div>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">
          {project.status}
        </span>
      </div>
      <ActionNotice error={error} message={message} />

      <section className="mt-10 rounded-2xl border border-zinc-800 p-6">
        <h2 className="font-semibold">Source media</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Upload an MP4, MOV, or WebM video. The original file is preserved and
          uploaded directly to private object storage.
        </p>
        {project.status === 'ACTIVE' ? (
          <SourceVideoUploader
            organizationSlug={organization.slug}
            projectId={project.id}
          />
        ) : (
          <p className="mt-5 text-sm text-amber-300">
            Restore this project before uploading source media.
          </p>
        )}
        <div className="mt-6 space-y-3">
          {mediaAssets.map((media) => (
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              key={media.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{media.originalName}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {(media.sizeBytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                    {media.contentType}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">
                  {media.status.replaceAll('_', ' ')}
                </span>
              </div>
              <MediaAnalysis
                media={media}
                organizationSlug={organization.slug}
                retryAction={retrySourceVideoAnalysis}
                transcriptionAction={requestSourceVideoTranscription}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-800 p-6">
        <h2 className="font-semibold">Project details</h2>
        <form action={updateProject} className="mt-5 space-y-4">
          <input
            name="organizationSlug"
            type="hidden"
            value={organization.slug}
          />
          <input name="projectId" type="hidden" value={project.id} />
          <label className="block text-sm">
            Name
            <input
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              defaultValue={project.name}
              maxLength={120}
              name="name"
              required
            />
          </label>
          <label className="block text-sm">
            Description <span className="text-zinc-500">(optional)</span>
            <textarea
              className="mt-2 min-h-28 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              defaultValue={project.description ?? ''}
              maxLength={2000}
              name="description"
            />
          </label>
          <FormSubmitButton
            className="rounded-xl bg-zinc-100 px-4 py-2 font-semibold text-zinc-950"
            label="Save project"
            pendingLabel="Saving project..."
          />
        </form>
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-800 p-6">
        <h2 className="font-semibold">Project lifecycle</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {project.status === 'ACTIVE'
            ? 'Archive this project to remove it from active work without deleting it.'
            : 'Restore this project when you are ready to continue working on it.'}
        </p>
        <form action={setProjectStatus} className="mt-5">
          <input
            name="organizationSlug"
            type="hidden"
            value={organization.slug}
          />
          <input name="projectId" type="hidden" value={project.id} />
          <input name="status" type="hidden" value={nextStatus} />
          <FormSubmitButton
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm"
            label={
              project.status === 'ACTIVE'
                ? 'Archive project'
                : 'Restore project'
            }
            pendingLabel={
              project.status === 'ACTIVE'
                ? 'Archiving project...'
                : 'Restoring project...'
            }
          />
        </form>
      </section>

      {canDelete ? (
        <section className="mt-12 border-t border-zinc-800 pt-8">
          <form action={deleteProject}>
            <input
              name="organizationSlug"
              type="hidden"
              value={organization.slug}
            />
            <input name="projectId" type="hidden" value={project.id} />
            <FormSubmitButton
              className="rounded-xl border border-red-900 px-4 py-2 text-sm text-red-300"
              label="Delete project permanently"
              pendingLabel="Deleting project..."
            />
          </form>
        </section>
      ) : null}
    </main>
  );
}
