import { Global, Module } from '@nestjs/common';
import { MAIL_SENDER, NoopMailSender } from './mail-sender.js';

@Global()
@Module({
  providers: [{ provide: MAIL_SENDER, useClass: NoopMailSender }],
  exports: [MAIL_SENDER],
})
export class MailModule {}
