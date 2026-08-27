'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Upload } from 'tus-js-client';

import {
  completeSourceVideoUpload,
  failSourceVideoUpload,
  initiateSourceVideoUpload,
} from './media-actions';

interface SourceVideoUploaderProps {
  readonly organizationSlug: string;
  readonly projectId: string;
}

type UploadPhase =
  'idle' | 'preparing' | 'uploading' | 'verifying' | 'success' | 'error';

const acceptedContentTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export function SourceVideoUploader({
  organizationSlug,
  projectId,
}: SourceVideoUploaderProps) {
  const router = useRouter();
  const uploadReference = useRef<Upload | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingMediaId, setPendingMediaId] = useState<string | null>(null);

  useEffect(
    () => () => {
      void uploadReference.current?.abort();
    },
    [],
  );

  async function verifyUpload(mediaId: string): Promise<void> {
    setPhase('verifying');
    setMessage('Upload complete. Verifying the stored video...');
    const result = await completeSourceVideoUpload({
      mediaId,
      organizationSlug,
      projectId,
    });
    if (result.error !== undefined) {
      setPhase('error');
      setMessage(result.error);
      return;
    }
    setPendingMediaId(null);
    setPhase('success');
    setMessage('Video uploaded and verified successfully.');
    setFile(null);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file === null || !acceptedContentTypes.has(file.type)) {
      setPhase('error');
      setMessage('Choose a valid MP4, MOV, or WebM video.');
      return;
    }

    setPhase('preparing');
    setProgress(0);
    setMessage('Preparing a secure upload...');
    const sessionResult = await initiateSourceVideoUpload({
      contentType: file.type,
      fileName: file.name,
      organizationSlug,
      projectId,
      sizeBytes: file.size,
    });
    if (sessionResult.error !== undefined) {
      setPhase('error');
      setMessage(sessionResult.error);
      return;
    }

    const session = sessionResult.data;
    setPendingMediaId(session.media.id);
    const upload = new Upload(file, {
      chunkSize: session.upload.chunkSizeBytes,
      endpoint: session.upload.endpoint,
      headers: { 'x-signature': session.upload.token },
      metadata: {
        bucketName: session.upload.bucket,
        cacheControl: '3600',
        contentType: file.type,
        objectName: session.upload.key,
      },
      onError(error) {
        setPendingMediaId(null);
        setPhase('error');
        setMessage(`Upload interrupted: ${error.message}`);
        void failSourceVideoUpload({
          mediaId: session.media.id,
          organizationSlug,
          projectId,
        }).then(() => router.refresh());
      },
      onProgress(bytesUploaded, bytesTotal) {
        const percentage =
          bytesTotal === 0 ? 0 : Math.round((bytesUploaded / bytesTotal) * 100);
        setProgress(percentage);
        setMessage(`Uploading video... ${percentage}%`);
      },
      onSuccess() {
        void verifyUpload(session.media.id);
      },
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      uploadDataDuringCreation: true,
    });
    uploadReference.current = upload;
    setPhase('uploading');
    setMessage('Uploading video... 0%');
    upload.start();
  }

  const busy = ['preparing', 'uploading', 'verifying'].includes(phase);

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm">
        Source video
        <input
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:font-semibold file:text-white"
          disabled={busy}
          name="video"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setMessage(null);
            setPhase('idle');
          }}
          required
          type="file"
        />
      </label>
      {phase === 'uploading' ? (
        <progress
          aria-label="Video upload progress"
          className="h-2 w-full accent-violet-500"
          max={100}
          value={progress}
        />
      ) : null}
      {message === null ? null : (
        <p
          aria-live={phase === 'error' ? 'assertive' : 'polite'}
          className={
            phase === 'error'
              ? 'text-sm text-red-300'
              : phase === 'success'
                ? 'text-sm text-emerald-300'
                : 'text-sm text-zinc-300'
          }
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
          disabled={busy || file === null}
          type="submit"
        >
          {phase === 'preparing'
            ? 'Preparing upload...'
            : phase === 'uploading'
              ? `Uploading... ${progress}%`
              : phase === 'verifying'
                ? 'Verifying upload...'
                : 'Upload source video'}
        </button>
        {phase === 'error' && pendingMediaId !== null ? (
          <button
            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm"
            onClick={() => void verifyUpload(pendingMediaId)}
            type="button"
          >
            Retry verification
          </button>
        ) : null}
      </div>
    </form>
  );
}
