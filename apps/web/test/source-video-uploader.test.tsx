import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('tus-js-client', () => ({ Upload: class Upload {} }));
vi.mock(
  '../app/organizations/[slug]/projects/[projectId]/media-actions',
  () => ({
    completeSourceVideoUpload: vi.fn(),
    failSourceVideoUpload: vi.fn(),
    initiateSourceVideoUpload: vi.fn(),
  }),
);

import { SourceVideoUploader } from '../app/organizations/[slug]/projects/[projectId]/source-video-uploader.js';

describe('SourceVideoUploader', () => {
  it('rejects unsupported files before requesting an upload session', () => {
    render(
      <SourceVideoUploader
        organizationSlug="creator-studio"
        projectId="5ea74442-0c18-4e90-a009-300fa2f39cbd"
      />,
    );
    const input = screen.getByLabelText('Source video');
    fireEvent.change(input, {
      target: {
        files: [new File(['not video'], 'notes.txt', { type: 'text/plain' })],
      },
    });
    const form = input.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a valid MP4, MOV, or WebM video.',
    );
  });
});
