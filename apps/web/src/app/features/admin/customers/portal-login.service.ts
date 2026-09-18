import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrandingService } from '../../../core/branding/branding.service';
import type { AdminUser, InviteInput, InviteResult, Language } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LinkDialogComponent, type LinkDialogData } from '../../../shared/link-dialog.component';

/** What an invitation needs to know about the customer it is sent to. */
export interface LoginInvitation {
  customerId: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * The portal login of a customer of the service. A customer created before the
 * portal existed has none, and until one is invited there is nobody to sign in
 * as, which is what both the list and the detail page have to show.
 */
@Injectable({ providedIn: 'root' })
export class PortalLoginService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly branding = inject(BrandingService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /** The language a new login starts in until the person picks another one. */
  defaultLanguage(): Language {
    return this.branding.branding().defaultLanguage;
  }

  /** The login that belongs to one customer of the service, or null when there is none. */
  async find(customerId: number): Promise<AdminUser | null> {
    const answer = await firstValueFrom(this.api.get<{ data: AdminUser[] }>('/admin/users'));
    return answer.data.find((user) => user.echocallCustomerId === customerId) ?? null;
  }

  /**
   * Invites a login for a customer that only exists in the service. Returns the
   * new login, or null when the portal refused; the refusal is already shown.
   */
  async invite(customer: LoginInvitation): Promise<AdminUser | null> {
    const body: InviteInput = {
      email: customer.email,
      role: 'user',
      language: this.defaultLanguage(),
      echocallCustomerId: customer.customerId,
      ...(customer.firstName ? { firstName: customer.firstName } : {}),
      ...(customer.lastName ? { lastName: customer.lastName } : {}),
    };
    try {
      const result = await firstValueFrom(this.api.post<InviteResult>('/admin/users/invite', body));
      this.announce(result);
      return result.user;
    } catch (err) {
      this.notify.apiError(err);
      return null;
    }
  }

  /**
   * Opens the portal as one customer, for the times when something has to be
   * done in their account. The session is handed over rather than copied, so
   * everything from here on runs in the customer's context and the way back is
   * the banner the shell then shows. Only a login the customer has accepted can
   * be opened; the portal says why when it refuses.
   */
  async open(customerId: number): Promise<boolean> {
    try {
      await this.auth.impersonate(customerId);
      await this.router.navigateByUrl('/app');
      return true;
    } catch (err) {
      this.notify.apiError(err);
      return false;
    }
  }

  /** Hands the one-time link over when there is no mail server to carry it. */
  announce(result: InviteResult): void {
    if (result.mailSent) {
      this.notify.success('admin.customers.inviteSent', { email: result.user.email });
      return;
    }
    const data: LinkDialogData = {
      titleKey: 'admin.users.inviteLinkTitle',
      messageKey: 'admin.users.linkMessage',
      link: result.inviteLink,
    };
    this.dialog.open<LinkDialogComponent, LinkDialogData>(LinkDialogComponent, { data });
  }
}
