import { FormSubmitButton } from './form-submit-button';

import type { MediaAssetSummary } from '@clipgenius/types';

interface MediaAnalysisProps {
  readonly media: MediaAssetSummary;
  readonly organizationSlug: string;
  readonly retryAction: (formData: FormData) => Promise<never>;
}

const analysisLabels = {
  FAILED: 'Analysis failed',
  QUEUED: 'Waiting to analyze',
  RUNNING: 'Analyzing video',
  SUCCEEDED: 'Analyzed',
} as const;

const analysisStyles = {
  FAILED: 'text-red-300',
  QUEUED: 'text-zinc-400',
  RUNNING: 'text-violet-300',
  SUCCEEDED: 'text-emerald-300',
} as const;

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Reports what the media worker has established about a source video. Analysis
 * runs in the background, so a page load shows the state at that moment rather
 * than blocking on the result.
 */
export function MediaAnalysis({
  media,
  organizationSlug,
  retryAction,
}: MediaAnalysisProps) {
  const { metadata, probe } = media;

  if (probe === null) {
    return media.status === 'UPLOADED' ? (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-zinc-500">Not analyzed yet.</p>
        <form action={retryAction}>
          <input name="mediaId" type="hidden" value={media.id} />
          <input
            name="organizationSlug"
            type="hidden"
            value={organizationSlug}
          />
          <input name="projectId" type="hidden" value={media.projectId} />
          <FormSubmitButton
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs"
            label="Start analysis"
            pendingLabel="Queueing analysis..."
          />
        </form>
      </div>
    ) : null;
  }

  return (
    <div className="mt-2 space-y-2">
      <p className={`text-sm ${analysisStyles[probe.status]}`}>
        {analysisLabels[probe.status]}
        {probe.status === 'FAILED' && probe.failureReason !== null
          ? `: ${probe.failureReason}`
          : ''}
      </p>
      {metadata === null ? null : (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
          <div className="flex gap-1">
            <dt className="text-zinc-500">Duration</dt>
            <dd>{formatDuration(metadata.durationSeconds)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-zinc-500">Resolution</dt>
            <dd>
              {metadata.width}×{metadata.height}
            </dd>
          </div>
          {metadata.frameRate === null ? null : (
            <div className="flex gap-1">
              <dt className="text-zinc-500">Frame rate</dt>
              <dd>{metadata.frameRate} fps</dd>
            </div>
          )}
          {metadata.videoCodec === null ? null : (
            <div className="flex gap-1">
              <dt className="text-zinc-500">Video</dt>
              <dd>{metadata.videoCodec}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt className="text-zinc-500">Audio</dt>
            <dd>
              {metadata.hasAudio ? (metadata.audioCodec ?? 'yes') : 'none'}
            </dd>
          </div>
        </dl>
      )}
      {probe.status === 'FAILED' ? (
        <form action={retryAction}>
          <input name="mediaId" type="hidden" value={media.id} />
          <input
            name="organizationSlug"
            type="hidden"
            value={organizationSlug}
          />
          <input name="projectId" type="hidden" value={media.projectId} />
          <FormSubmitButton
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs"
            label="Retry analysis"
            pendingLabel="Queueing analysis..."
          />
        </form>
      ) : null}
    </div>
  );
}
