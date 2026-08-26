import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { createClient } from '../../../lib/supabase/server';

const allowedEmailOtpTypes = new Set<EmailOtpType>([
  'email',
  'email_change',
  'invite',
  'magiclink',
  'recovery',
  'signup',
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');

  if (
    tokenHash !== null &&
    type !== null &&
    allowedEmailOtpTypes.has(type as EmailOtpType)
  ) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error === null) {
      const response = NextResponse.redirect(
        new URL('/organizations', request.url),
      );
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }

  const response = NextResponse.redirect(
    new URL(
      '/login?error=Confirmation%20link%20is%20invalid%20or%20expired.',
      request.url,
    ),
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
