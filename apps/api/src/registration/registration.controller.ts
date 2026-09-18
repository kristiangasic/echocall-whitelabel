import { Body, Controller, HttpCode, Inject, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminCustomersService } from '../admin/customers/admin-customers.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Public } from '../auth/decorators.js';
import { type RegisterDto, registerSchema } from '../auth/dto.js';
import { apiError, describeError } from '../common/http-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { MAIL_SENDER, type MailSender } from '../mail/mail-sender.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * What a sign-up answers with. It says nothing about the address that was typed:
 * the same answer comes back whether an account was opened, whether one already
 * existed, or whether the service refused the address, so the form cannot be
 * used to find out who has an account here.
 */
export interface RegisterResult {
  accepted: true;
}

const ACCEPTED: RegisterResult = { accepted: true };

/**
 * Self-service sign-up. A visitor who fills in the form becomes a customer of
 * the operator: an account at the service plus a login here, in the one step the
 * operator would otherwise take by hand. It only answers while the operator has
 * switched sign-ups on.
 */
@Controller('auth')
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly customers: AdminCustomersService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  @HttpCode(202)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
    @Req() req: Request,
  ): Promise<RegisterResult> {
    const { selfServiceEnabled } = await this.settings.getRegistration();
    if (!selfServiceEnabled) throw apiError(404, 'registration_closed', 'This portal does not take sign-ups');

    const taken = await this.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', body.email)
      .executeTakeFirst();
    if (taken) {
      // Someone typed an address that already has an account. Saying so would
      // turn this form into a way to look accounts up, so the answer is the same
      // as for a fresh one and nothing is created or sent.
      this.logger.log(`Sign-up for an address that already has an account was ignored`);
      return ACCEPTED;
    }

    let created;
    try {
      created = await this.customers.create(
        {
          email: body.email,
          language: body.language,
          ...(body.firstName === undefined ? {} : { firstName: body.firstName }),
          ...(body.lastName === undefined ? {} : { lastName: body.lastName }),
          ...(body.company === undefined ? {} : { company: body.company }),
          // The visitor gets the sign-up mail below, not an operator's invitation.
          sendInvite: false,
        },
        { actor: null, ip: req.ip },
      );
    } catch (error) {
      // The service knows this address already, or refused it. Either way the
      // visitor learns nothing from it, and the operator finds it in the log.
      this.logger.warn(`Sign-up for ${body.email} was refused: ${describeError(error)}`);
      return ACCEPTED;
    }

    const sent = await this.mail.sendRegistration(
      { email: body.email, language: body.language, firstName: body.firstName ?? null },
      created.inviteLink,
    );
    if (!sent) this.logger.error(`Sign-up mail to ${body.email} could not be sent`);
    await this.audit.record({
      actorUserId: null,
      action: 'auth.registered',
      targetType: 'user',
      targetId: created.user.id,
      details: { email: body.email, customerId: created.customerId, mailSent: sent },
      ip: req.ip,
    });
    return ACCEPTED;
  }
}
