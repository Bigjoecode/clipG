import Link from 'next/link';

import { TranscriptView } from '../../../../../../../../components/transcript-view';
import { authenticatedApiRequest } from '../../../../../../../../lib/api';

import type { TranscriptDetail } from '@clipgenius/types';

interface TranscriptPageProps {
  readonly params: Promise<{
    readonly mediaId: string;
    readonly projectId: string;
    readonly slug: string;
  }>;
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
  const { mediaId, projectId, slug } = await params;
  const projectPath = `/organizations/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`;
  const transcript = await authenticatedApiRequest<TranscriptDetail>(
    `${projectPath}/media/${encodeURIComponent(mediaId)}/transcript`,
  );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <Link className="text-sm text-violet-300" href={projectPath}>
        ← Back to project
      </Link>
      <div className="my-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
          Transcript
        </p>
        <h1 className="mt-2 text-4xl font-semibold">
          {transcript.originalName}
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          {transcript.segmentCount} segments · {transcript.provider} ·{' '}
          {transcript.model}
        </p>
      </div>
      <TranscriptView transcript={transcript} />
    </main>
  );
}
