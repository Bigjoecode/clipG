import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TranscriptView,
  formatTranscriptTime,
} from '../components/transcript-view';

import type { TranscriptDetail } from '@clipgenius/types';

const transcript: TranscriptDetail = {
  createdAt: '2026-08-28T12:00:00.000Z',
  diarized: true,
  durationSeconds: 65,
  id: '82c63e3b-97f4-4ab0-9c16-1b93a7798080',
  language: null,
  mediaAssetId: 'c728fe4f-2b0d-4a28-8191-608c52e50d88',
  model: 'gpt-4o-transcribe-diarize',
  organizationId: '5d4d3a1a-b0ed-4c63-9f3f-2f7b7a716a29',
  originalName: 'sermon.mp4',
  projectId: '5ea74442-0c18-4e90-a009-300fa2f39cbd',
  provider: 'openai',
  segmentCount: 1,
  speakerCount: 2,
  segments: [
    {
      endSeconds: 65,
      id: '72c63e3b-97f4-4ab0-9c16-1b93a7798080',
      index: 0,
      speaker: 'A',
      startSeconds: 60,
      text: 'Thank you for listening.',
    },
  ],
  text: 'Thank you for listening.',
  updatedAt: '2026-08-28T12:00:00.000Z',
};

describe('TranscriptView', () => {
  it('renders full text, timestamps, and speaker labels', () => {
    render(<TranscriptView transcript={transcript} />);

    expect(screen.getAllByText('Thank you for listening.')).toHaveLength(2);
    expect(screen.getByText('1:00–1:05')).toBeInTheDocument();
    expect(screen.getByText('Speaker A')).toBeInTheDocument();
  });

  it('formats hour-long timestamps without losing the hour', () => {
    expect(formatTranscriptTime(3_661)).toBe('1:01:01');
  });
});
