'use client';

interface OrganizationsErrorProps {
  readonly retry: () => void;
}

export default function OrganizationsError({ retry }: OrganizationsErrorProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16 sm:px-10">
      <section className="w-full rounded-2xl border border-amber-900/70 bg-amber-950/20 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
          Connection interrupted
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          ClipGenius could not reach the API
        </h1>
        <p className="mt-4 text-zinc-300">
          Your page is safe. Make sure the API terminal is running, then retry
          the connection.
        </p>
        <button
          className="mt-6 rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500"
          onClick={() => retry()}
          type="button"
        >
          Retry connection
        </button>
      </section>
    </main>
  );
}
