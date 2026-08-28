import type { TranscriptDetail } from '@clipgenius/types';

export function formatTranscriptTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function TranscriptView({
  transcript,
}: {
  readonly transcript: TranscriptDetail;
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-zinc-800 p-6">
        <h2 className="font-semibold">Full transcript</h2>
        <p className="mt-4 whitespace-pre-wrap leading-7 text-zinc-300">
          {transcript.text}
        </p>
      </section>
      <section className="rounded-2xl border border-zinc-800 p-6">
        <h2 className="font-semibold">Timestamped segments</h2>
        <div className="mt-5 space-y-3">
          {transcript.segments.map((segment) => (
            <article
              className="grid gap-2 rounded-xl bg-zinc-900/60 p-4 sm:grid-cols-[7rem_1fr]"
              key={segment.id}
            >
              <div className="text-sm text-violet-300">
                <p>
                  {formatTranscriptTime(segment.startSeconds)}–
                  {formatTranscriptTime(segment.endSeconds)}
                </p>
                {segment.speaker === null ? null : (
                  <p className="mt-1 text-zinc-500">
                    Speaker {segment.speaker}
                  </p>
                )}
              </div>
              <p className="leading-6 text-zinc-300">{segment.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
