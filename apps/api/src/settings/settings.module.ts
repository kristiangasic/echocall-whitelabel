import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsCoreModule } from './settings-core.module.js';

@Global()
@Module({
  imports: [SettingsCoreModule, AuthModule, AuditModule, MailModule],
  controllers: [SettingsController],
  exports: [SettingsCoreModule],
})
export class SettingsModule {}
