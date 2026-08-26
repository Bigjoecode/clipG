import { parseAuthEnvironment } from '@clipgenius/config';
import { Module } from '@nestjs/common';

import { AUTHENTICATION_PROVIDER } from './authentication-provider.js';
import { AuthenticationController } from './authentication.controller.js';
import { AuthenticationGuard } from './authentication.guard.js';
import { AuthenticationService } from './authentication.service.js';
import { SupabaseAuthenticationProvider } from './supabase-authentication.provider.js';

@Module({
  controllers: [AuthenticationController],
  exports: [AuthenticationGuard, AuthenticationService],
  providers: [
    {
      provide: AUTHENTICATION_PROVIDER,
      useFactory: (): SupabaseAuthenticationProvider => {
        const environment = parseAuthEnvironment(process.env);
        return new SupabaseAuthenticationProvider(
          environment.SUPABASE_URL,
          environment.SUPABASE_PUBLISHABLE_KEY,
        );
      },
    },
    AuthenticationService,
    AuthenticationGuard,
  ],
})
export class AuthenticationModule {}
