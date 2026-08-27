import { redirect } from 'next/navigation';

import { getWebEnvironment } from './environment';
import { createClient } from './supabase/server';

interface ApiErrorBody {
  readonly message?: string | readonly string[];
}

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function errorMessage(body: ApiErrorBody | null): string {
  const message = body?.message;
  if (Array.isArray(message)) {
    return message.join(' ');
  }
  return typeof message === 'string'
    ? message
    : 'The request could not be completed.';
}

export async function authenticatedApiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const supabase = await createClient();
  const [{ data: claimsData, error: claimsError }, { data: sessionData }] =
    await Promise.all([supabase.auth.getClaims(), supabase.auth.getSession()]);

  if (
    claimsError !== null ||
    claimsData === null ||
    sessionData.session?.access_token === undefined
  ) {
    redirect('/login');
  }

  const environment = getWebEnvironment();
  let response: Response;
  try {
    response = await fetch(`${environment.API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        ...(init?.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      'The API connection was interrupted. Refresh to check whether the change completed before trying again.',
      503,
    );
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new ApiRequestError(errorMessage(body), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
