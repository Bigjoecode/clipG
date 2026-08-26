import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getWebEnvironment } from '../environment';

export async function createClient() {
  const environment = getWebEnvironment();
  const cookieStore = await cookies();

  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, options, value } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. The root proxy refreshes
            // the session before protected pages are rendered.
          }
        },
      },
    },
  );
}
