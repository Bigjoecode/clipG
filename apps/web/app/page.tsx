import { BrandMark } from '@clipgenius/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-10">
      <header>
        <BrandMark className="text-lg font-semibold tracking-tight" />
      </header>

      <section className="flex flex-1 flex-col justify-center py-20">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-violet-400">
          AI Content Production Engine
        </p>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
          One Video. An Entire Content Campaign.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400 sm:text-xl">
          Turn raw video into polished, platform-optimized content. The
          engineering foundation is ready for the product workflows that follow.
        </p>
        <div className="mt-9 flex gap-4">
          <Link
            className="rounded-xl bg-violet-600 px-5 py-3 font-semibold hover:bg-violet-500"
            href="/signup"
          >
            Create account
          </Link>
          <Link
            className="rounded-xl border border-zinc-700 px-5 py-3 font-semibold hover:border-zinc-500"
            href="/login"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
