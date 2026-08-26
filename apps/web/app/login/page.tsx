import Link from 'next/link';

import { login } from '../auth/actions';

interface LoginPageProps {
  readonly searchParams: Promise<{
    readonly error?: string;
    readonly message?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link className="text-sm font-semibold text-violet-300" href="/">
        ClipGenius
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-zinc-400">
        Continue building your content campaign.
      </p>

      {message === undefined ? null : (
        <p className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          {message}
        </p>
      )}
      {error === undefined ? null : (
        <p className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form action={login} className="mt-8 space-y-5">
        <label className="block text-sm font-medium">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <button
          className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500"
          type="submit"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-400">
        New to ClipGenius?{' '}
        <Link className="font-semibold text-violet-300" href="/signup">
          Create an account
        </Link>
      </p>
    </main>
  );
}
