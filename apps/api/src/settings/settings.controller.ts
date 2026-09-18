import { Body, Controller, Delete, Get, HttpCode, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Public, Roles } from '../auth/decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { apiError } from '../common/http-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MailService } from '../mail/mail.service.js';
import { type Branding, brandingSchema, type PublicBranding } from './branding.js';
import { type SmtpTestDto, smtpTestSchema, type SmtpUpdateDto, smtpUpdateSchema } from './dto.js';
import { type PublicRegistration, type RegistrationSettings, registrationSchema } from './registration.js';
import { SettingsService, type SmtpSettings } from './settings.service.js';

/**
 * What the sign-in page needs before anyone has signed in: how the portal looks
 * and which ways in it offers. Both in one answer, because every visitor needs
 * both and a second round trip is a second wait.
 */
export interface PublicSettings extends PublicBranding {
  registration: PublicRegistration;
}

/** The two flags, plus whether the portal could actually send the mail they depend on. */
export interface RegistrationView extends RegistrationSettings {
  /** False when no mail server is configured; neither flag can be on then. */
  mailReady: boolean;
}

/** What the admin page sees about mail delivery; never the password itself. */
export interface SmtpView {
  configured: boolean;
  /** Where the active settings come from: the database, the environment, or nowhere. */
  source: 'settings' | 'env' | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  from: string | null;
  hasPassword: boolean;
}

@Controller()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Get('settings/public')
  async publicSettings(): Promise<PublicSettings> {
    const [branding, registration] = await Promise.all([
      this.settings.getBranding(),
      this.settings.getRegistration(),
    ]);
    return { ...branding, registration };
  }

  @Roles('admin')
  @Get('admin/settings/branding')
  branding(): Promise<Branding> {
    return this.settings.getBranding();
  }

  @Roles('admin')
  @Put('admin/settings/branding')
  async updateBranding(
    @Body(new ZodValidationPipe<Branding>(brandingSchema)) body: Branding,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<Branding> {
    const before = await this.settings.getBranding();
    await this.settings.setBranding(body);
    const changed = (Object.keys(body) as Array<keyof Branding>).filter((key) => before[key] !== body[key]);
    await this.audit.record({
      actorUserId: user.id,
      action: 'settings.branding_updated',
      targetType: 'settings',
      targetId: 'branding',
      details: { changed },
      ip: req.ip,
    });
    return body;
  }

  @Roles('admin')
  @Get('admin/settings/registration')
  registration(): Promise<RegistrationView> {
    return this.registrationView();
  }

  @Roles('admin')
  @Put('admin/settings/registration')
  async updateRegistration(
    @Body(new ZodValidationPipe<RegistrationSettings>(registrationSchema)) body: RegistrationSettings,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<RegistrationView> {
    // A sign-up is finished by a mail the portal sends. Without a mail server it
    // would only produce accounts nobody can open, so it cannot be switched on.
    const mailReady = (await this.mail.resolveSmtp()) !== null;
    if (!mailReady && body.selfServiceEnabled)
      throw apiError(400, 'smtp_required', 'Set up a mail server first; a sign-up is finished by mail');
    const before = await this.settings.getRegistration();
    await this.settings.setRegistration(body);
    const changed = (Object.keys(body) as Array<keyof RegistrationSettings>).filter(
      (key) => before[key] !== body[key],
    );
    await this.audit.record({
      actorUserId: user.id,
      action: 'settings.registration_updated',
      targetType: 'settings',
      targetId: 'registration',
      details: { changed, ...body },
      ip: req.ip,
    });
    return { ...body, mailReady };
  }

  @Roles('admin')
  @Get('admin/settings/smtp')
  async smtp(): Promise<SmtpView> {
    return this.smtpView();
  }

  @Roles('admin')
  @Put('admin/settings/smtp')
  async updateSmtp(
    @Body(new ZodValidationPipe(smtpUpdateSchema)) body: SmtpUpdateDto,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<SmtpView> {
    const current = await this.settings.getSmtp();
    const pass = body.pass === undefined || body.pass === '' ? (current?.pass ?? null) : body.pass;
    const next: SmtpSettings = {
      host: body.host,
      port: body.port,
      secure: body.secure,
      user: body.user,
      pass,
      from: body.from,
    };
    await this.settings.setSmtp(next);
    await this.audit.record({
      actorUserId: user.id,
      action: 'settings.smtp_updated',
      targetType: 'settings',
      targetId: 'smtp',
      details: { host: next.host, port: next.port, secure: next.secure, user: next.user, from: next.from },
      ip: req.ip,
    });
    return this.smtpView();
  }

  @Roles('admin')
  @Delete('admin/settings/smtp')
  @HttpCode(204)
  async removeSmtp(@CurrentUser() user: SessionUser, @Req() req: Request): Promise<void> {
    await this.settings.setSmtp(null);
    await this.audit.record({
      actorUserId: user.id,
      action: 'settings.smtp_removed',
      targetType: 'settings',
      targetId: 'smtp',
      ip: req.ip,
    });
  }

  @Roles('admin')
  @Post('admin/settings/smtp/test')
  @HttpCode(200)
  async testSmtp(@Body(new ZodValidationPipe(smtpTestSchema)) body: SmtpTestDto): Promise<{ sent: true }> {
    await this.mail.sendTest(body.to);
    return { sent: true };
  }

  private async registrationView(): Promise<RegistrationView> {
    const [registration, smtp] = await Promise.all([
      this.settings.getRegistration(),
      this.mail.resolveSmtp(),
    ]);
    return { ...registration, mailReady: smtp !== null };
  }

  private async smtpView(): Promise<SmtpView> {
    const active = await this.mail.resolveSmtp();
    if (!active) {
      return {
        configured: false,
        source: null,
        host: null,
        port: null,
        secure: false,
        user: null,
        from: null,
        hasPassword: false,
      };
    }
    const { smtp, source } = active;
    return {
      configured: true,
      source,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      from: smtp.from,
      hasPassword: smtp.pass !== null && smtp.pass !== '',
    };
  }
}
