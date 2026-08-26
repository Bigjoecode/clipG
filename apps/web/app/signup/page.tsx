import Link from 'next/link';

import { signup } from '../auth/actions';

interface SignupPageProps {
  readonly searchParams: Promise<{ readonly error?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link className="text-sm font-semibold text-violet-300" href="/">
        ClipGenius
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mt-3 text-zinc-400">
        Start with a secure ClipGenius workspace.
      </p>

      {error === undefined ? null : (
        <p className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form action={signup} className="mt-8 space-y-5">
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
            autoComplete="new-password"
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
          Create account
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-400">
        Already registered?{' '}
        <Link className="font-semibold text-violet-300" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
