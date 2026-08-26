'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getWebEnvironment } from '../../lib/environment';
import { createClient } from '../../lib/supabase/server';

const credentialsSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

function authRedirect(
  path: string,
  kind: 'error' | 'message',
  message: string,
): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData): Promise<never> {
  const result = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!result.success) {
    authRedirect('/login', 'error', 'Enter a valid email and password.');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);
  if (error !== null) {
    authRedirect('/login', 'error', 'Email or password is incorrect.');
  }

  redirect('/organizations');
}

export async function signup(formData: FormData): Promise<never> {
  const result = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!result.success) {
    authRedirect(
      '/signup',
      'error',
      'Use a valid email and at least 8 password characters.',
    );
  }

  const environment = getWebEnvironment();
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    ...result.data,
    options: {
      emailRedirectTo: `${environment.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    },
  });
  if (error !== null) {
    authRedirect(
      '/signup',
      'error',
      'The account could not be created. Try again shortly.',
    );
  }

  authRedirect(
    '/login',
    'message',
    'Check your email to confirm your account.',
  );
}

export async function logout(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
