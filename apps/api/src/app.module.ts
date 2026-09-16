import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { AdminUsersModule } from './admin/users/admin-users.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { EchoCallModule } from './echocall/echocall.module.js';
import { MailModule } from './mail/mail.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SetupModule } from './setup/setup.module.js';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    EchoCallModule,
    MailModule,
    AuditModule,
    AuthModule,
    SettingsModule,
    SetupModule,
    AdminUsersModule,
  ],
})
export class AppModule {}
