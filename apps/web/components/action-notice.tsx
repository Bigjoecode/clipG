interface ActionNoticeProps {
  readonly error?: string | undefined;
  readonly message?: string | undefined;
}

export function ActionNotice({ error, message }: ActionNoticeProps) {
  if (error !== undefined) {
    return (
      <p
        aria-live="assertive"
        className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (message !== undefined) {
    return (
      <p
        aria-live="polite"
        className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200"
        role="status"
      >
        {message}
      </p>
    );
  }

  return null;
}
