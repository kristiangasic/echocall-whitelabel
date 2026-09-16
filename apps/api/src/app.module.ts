import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { MailModule } from './mail/mail.module.js';

@Module({
  imports: [ConfigModule, DbModule, MailModule, AuthModule],
})
export class AppModule {}
