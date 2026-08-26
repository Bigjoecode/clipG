'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getWebEnvironment } from '../environment';

export function createClient() {
  const environment = getWebEnvironment();
  return createBrowserClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
