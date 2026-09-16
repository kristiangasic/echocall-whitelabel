import { Global, Module } from '@nestjs/common';
import { MAIL_SENDER } from './mail-sender.js';
import { MailService } from './mail.service.js';

/** MailService needs SettingsService, which the global SettingsModule provides. */
@Global()
@Module({
  providers: [MailService, { provide: MAIL_SENDER, useExisting: MailService }],
  exports: [MailService, MAIL_SENDER],
})
export class MailModule {}
