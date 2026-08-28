import Link from 'next/link';

import { FormSubmitButton } from './form-submit-button';

import type { MediaAssetSummary } from '@clipgenius/types';

interface MediaAnalysisProps {
  readonly media: MediaAssetSummary;
  readonly organizationSlug: string;
  readonly retryAction: (formData: FormData) => Promise<never>;
  readonly transcriptionAction: (formData: FormData) => Promise<never>;
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
  transcriptionAction,
}: MediaAnalysisProps) {
  const { metadata, probe, transcript, transcription } = media;

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
      {probe.status === 'SUCCEEDED' && metadata?.hasAudio === true ? (
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          {transcription === null ? (
            <TranscriptionForm
              action={transcriptionAction}
              label="Start transcription"
              media={media}
              organizationSlug={organizationSlug}
            />
          ) : (
            <p className={`text-sm ${analysisStyles[transcription.status]}`}>
              {transcription.status === 'QUEUED'
                ? 'Waiting to transcribe'
                : transcription.status === 'RUNNING'
                  ? 'Transcribing audio'
                  : transcription.status === 'SUCCEEDED'
                    ? 'Transcribed'
                    : `Transcription failed${
                        transcription.failureReason === null
                          ? ''
                          : `: ${transcription.failureReason}`
                      }`}
            </p>
          )}
          {transcription?.status === 'FAILED' ? (
            <TranscriptionForm
              action={transcriptionAction}
              label="Retry transcription"
              media={media}
              organizationSlug={organizationSlug}
            />
          ) : null}
          {transcription?.status === 'SUCCEEDED' && transcript !== null ? (
            <Link
              className="inline-flex rounded-lg border border-emerald-900 px-3 py-1.5 text-xs text-emerald-300"
              href={`/organizations/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(media.projectId)}/media/${encodeURIComponent(media.id)}/transcript`}
            >
              View transcript ({transcript.segmentCount} segments)
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TranscriptionForm({
  action,
  label,
  media,
  organizationSlug,
}: {
  readonly action: (formData: FormData) => Promise<never>;
  readonly label: string;
  readonly media: MediaAssetSummary;
  readonly organizationSlug: string;
}) {
  return (
    <form action={action}>
      <input name="mediaId" type="hidden" value={media.id} />
      <input name="organizationSlug" type="hidden" value={organizationSlug} />
      <input name="projectId" type="hidden" value={media.projectId} />
      <FormSubmitButton
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs"
        label={label}
        pendingLabel="Queueing transcription..."
      />
    </form>
  );
}
