import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { AuthModule } from './auth.module.js';
import { TwoFactorController } from './two-factor.controller.js';

/**
 * Separate from AuthModule because the enrolment needs the branding to name
 * the portal in the authenticator app, and the settings live one module
 * further out. The service itself stays in AuthModule, where the login uses it.
 */
@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [TwoFactorController],
})
export class TwoFactorModule {}
