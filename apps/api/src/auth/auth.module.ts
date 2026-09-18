import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module.js';
import { CommonModule } from '../common/common.module.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { LoginService } from './login.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [
    AuditModule,
    CommonModule,
    // Applied only where a route opts in with @UseGuards(ThrottlerGuard): the
    // routes anyone may call, which is to say everything about a sign-in link.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      errorMessage: 'Too many attempts, try again in a minute',
    }),
  ],
  controllers: [AuthController],
  providers: [
    SessionService,
    TokenService,
    LoginService,
    TwoFactorService,
    // Global guards run in this order: CSRF header, session cookie, roles.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // ThrottlerModule is re-exported so other modules can opt routes into @UseGuards(ThrottlerGuard).
  exports: [SessionService, TokenService, LoginService, TwoFactorService, ThrottlerModule],
})
export class AuthModule {}
