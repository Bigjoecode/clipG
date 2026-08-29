import Link from 'next/link';

import { authenticatedApiRequest } from '../../../../../../../../lib/api';

import type { ContentAnalysisDetail } from '@clipgenius/types';

interface ContentIntelligencePageProps {
  readonly params: Promise<{
    readonly mediaId: string;
    readonly projectId: string;
    readonly slug: string;
  }>;
}

function timestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export default async function ContentIntelligencePage({
  params,
}: ContentIntelligencePageProps) {
  const { mediaId, projectId, slug } = await params;
  const projectPath = `/organizations/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`;
  const analysis = await authenticatedApiRequest<ContentAnalysisDetail>(
    `${projectPath}/media/${encodeURIComponent(mediaId)}/content-intelligence`,
  );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <Link className="text-sm text-violet-300" href={projectPath}>
        ← Back to project
      </Link>
      <header className="my-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
          Content Intelligence
        </p>
        <h1 className="mt-2 text-4xl font-semibold">{analysis.originalName}</h1>
        <p className="mt-4 max-w-3xl text-zinc-300">{analysis.summary}</p>
        <p className="mt-3 text-xs text-zinc-500">
          {analysis.provider} · {analysis.model} · prompt {analysis.promptId} v
          {analysis.promptVersion}
        </p>
      </header>

      {analysis.stale ? (
        <p className="mb-8 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
          This intelligence was produced from an older transcript. Refresh it
          from the project page before using these opportunities.
        </p>
      ) : null}

      <section className="grid gap-4 rounded-2xl border border-zinc-800 p-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">Topics</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.topics.map((topic) => (
              <span
                className="rounded-full bg-zinc-800 px-3 py-1 text-xs"
                key={topic}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Keywords</h2>
          <p className="mt-3 text-sm text-zinc-400">
            {analysis.keywords.join(' · ')}
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Content opportunities</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Traceable selections from the original source video.
            </p>
          </div>
          <span className="text-sm text-zinc-500">
            {analysis.opportunityCount} found
          </span>
        </div>

        {analysis.opportunities.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 p-6 text-zinc-400">
            No strong standalone opportunities were identified.
          </p>
        ) : (
          analysis.opportunities.map((opportunity) => (
            <article
              className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6"
              key={opportunity.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                    {opportunity.type.replaceAll('_', ' ')} ·{' '}
                    {timestamp(opportunity.startSeconds)}–
                    {timestamp(opportunity.endSeconds)}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {opportunity.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {opportunity.topic}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">
                  {opportunity.recommendedDurationSeconds}s target
                </span>
              </div>
              <p className="mt-5 text-lg text-zinc-100">“{opportunity.hook}”</p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {opportunity.summary}
              </p>
              <blockquote className="mt-4 border-l-2 border-violet-700 pl-4 text-sm italic text-zinc-400">
                {opportunity.evidenceText}
              </blockquote>
              <p className="mt-4 text-sm text-zinc-400">
                <span className="text-zinc-200">Why it works:</span>{' '}
                {opportunity.rationale}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-300">
                {opportunity.recommendedPlatforms.map((platform) => (
                  <span
                    className="rounded-full border border-zinc-700 px-2.5 py-1"
                    key={platform}
                  >
                    {platform}
                  </span>
                ))}
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(opportunity.scores).map(([label, score]) => (
                  <div className="rounded-lg bg-zinc-900 p-2" key={label}>
                    <dt>{label.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd className="mt-1 font-semibold text-zinc-100">
                      {score}/100
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
