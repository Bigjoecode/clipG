import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaAnalysis } from '../components/media-analysis';

import type {
  MediaAssetSummary,
  MediaJobSummary,
  MediaTechnicalMetadata,
} from '@clipgenius/types';

const retryAction = vi.fn<(formData: FormData) => Promise<never>>();
const transcriptionAction = vi.fn<(formData: FormData) => Promise<never>>();

function media(overrides: Partial<MediaAssetSummary> = {}): MediaAssetSummary {
  return {
    contentType: 'video/mp4',
    createdAt: '2026-08-27T12:00:00.000Z',
    id: 'c728fe4f-2b0d-4a28-8191-608c52e50d88',
    kind: 'SOURCE_VIDEO',
    metadata: null,
    organizationId: '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29',
    originalName: 'sermon.mp4',
    probe: null,
    projectId: '5ea74442-0c18-4e90-a009-300fa2f39cbd',
    sizeBytes: 1_024,
    status: 'UPLOADED',
    transcript: null,
    transcription: null,
    updatedAt: '2026-08-27T12:00:00.000Z',
    uploadedAt: '2026-08-27T12:01:00.000Z',
    uploadedById: 'ff2b9fef-ec23-48f2-a7bd-8e9c75edbb44',
    ...overrides,
  };
}

function probe(overrides: Partial<MediaJobSummary> = {}): MediaJobSummary {
  return {
    attempts: 1,
    failureReason: null,
    finishedAt: null,
    id: '3f0c2b6e-1a58-4a4f-9d1b-6f2c0d5e7a11',
    queuedAt: '2026-08-27T12:02:00.000Z',
    startedAt: null,
    status: 'QUEUED',
    type: 'MEDIA_PROBE',
    ...overrides,
  };
}

const metadata: MediaTechnicalMetadata = {
  audioCodec: 'aac',
  bitRate: 2_500_000,
  durationSeconds: 92.457,
  frameRate: 29.97,
  hasAudio: true,
  height: 1080,
  videoCodec: 'h264',
  width: 1920,
};

function renderAnalysis(asset: MediaAssetSummary) {
  return render(
    <MediaAnalysis
      media={asset}
      organizationSlug="creator-studio"
      retryAction={retryAction}
      transcriptionAction={transcriptionAction}
    />,
  );
}

describe('MediaAnalysis', () => {
  it('reports that a verified upload is still waiting to be analyzed', () => {
    renderAnalysis(media());

    expect(screen.getByText('Not analyzed yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start analysis' }),
    ).toBeInTheDocument();
  });

  it('shows analysis progress while the worker holds the job', () => {
    renderAnalysis(media({ probe: probe({ status: 'RUNNING' }) }));

    expect(screen.getByText('Analyzing video')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry analysis' }),
    ).not.toBeInTheDocument();
  });

  it('presents the technical metadata a successful probe recorded', () => {
    renderAnalysis(media({ metadata, probe: probe({ status: 'SUCCEEDED' }) }));

    expect(screen.getByText('Analyzed')).toBeInTheDocument();
    expect(screen.getByText('1:32')).toBeInTheDocument();
    expect(screen.getByText('1920×1080')).toBeInTheDocument();
    expect(screen.getByText('29.97 fps')).toBeInTheDocument();
    expect(screen.getByText('h264')).toBeInTheDocument();
  });

  it('offers transcription after successful analysis with audio', () => {
    renderAnalysis(media({ metadata, probe: probe({ status: 'SUCCEEDED' }) }));

    expect(
      screen.getByRole('button', { name: 'Start transcription' }),
    ).toBeInTheDocument();
  });

  it('links to the completed timestamped transcript', () => {
    renderAnalysis(
      media({
        metadata,
        probe: probe({ status: 'SUCCEEDED' }),
        transcript: {
          createdAt: '2026-08-28T12:00:00.000Z',
          diarized: true,
          id: '82c63e3b-97f4-4ab0-9c16-1b93a7798080',
          language: null,
          model: 'gpt-4o-transcribe-diarize',
          provider: 'openai',
          segmentCount: 12,
          speakerCount: 2,
          updatedAt: '2026-08-28T12:00:00.000Z',
        },
        transcription: probe({
          id: '92c63e3b-97f4-4ab0-9c16-1b93a7798080',
          status: 'SUCCEEDED',
          type: 'TRANSCRIPTION',
        }),
      }),
    );

    expect(
      screen.getByRole('link', { name: 'View transcript (12 segments)' }),
    ).toHaveAttribute(
      'href',
      `/organizations/creator-studio/projects/${media().projectId}/media/${media().id}/transcript`,
    );
  });

  it('reports a silent video as having no audio', () => {
    renderAnalysis(
      media({
        metadata: { ...metadata, audioCodec: null, hasAudio: false },
        probe: probe({ status: 'SUCCEEDED' }),
      }),
    );

    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('explains a failure and offers to analyze the video again', () => {
    renderAnalysis(
      media({
        probe: probe({
          failureReason: 'The file does not contain a video stream.',
          status: 'FAILED',
        }),
      }),
    );

    expect(
      screen.getByText(
        'Analysis failed: The file does not contain a video stream.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry analysis' }),
    ).toBeInTheDocument();
  });

  it('says nothing about analysis for an upload that never completed', () => {
    const { container } = renderAnalysis(media({ status: 'UPLOAD_PENDING' }));

    expect(container).toBeEmptyDOMElement();
  });
});
