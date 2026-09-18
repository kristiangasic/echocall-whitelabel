import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrandingService } from '../../../core/branding/branding.service';
import type { AdminUser, InviteResult, SignInLinkResult, UserStatus } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LinkDialogComponent, type LinkDialogData } from '../../../shared/link-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { NO_VALUE } from '../../../shared/no-value';
import { UserDialogComponent, type UserDialogData, type UserDialogResult } from './user-dialog.component';

@Component({
  selector: 'app-admin-users-page',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('admin.users.title') }}</h1>
        <button mat-flat-button type="button" (click)="invite()" data-testid="invite">
          <mat-icon>person_add</mat-icon>
          {{ t('admin.users.invite') }}
        </button>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="users()" data-testid="users-table">
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.email') }}</th>
            <td mat-cell *matCellDef="let u" [attr.data-label]="t('fields.email')">
              <div>{{ u.email }}</div>
              @if (name(u); as n) {
                <div class="cell-sub">{{ n }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.role') }}</th>
            <td mat-cell *matCellDef="let u" [attr.data-label]="t('fields.role')">
              {{ t('roles.' + u.role) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let u" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + u.status">{{
                t('statuses.' + u.status)
              }}</span>
              @if (u.twoFactorEnabled) {
                <span class="two-factor" [title]="t('admin.users.twoFactorOn')">
                  <mat-icon inline>verified_user</mat-icon>
                  {{ t('admin.users.twoFactor') }}
                </span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.customerId') }}</th>
            <td mat-cell *matCellDef="let u" [attr.data-label]="t('fields.customerId')">
              {{ u.echocallCustomerId ?? noValue }}
            </td>
          </ng-container>
          <ng-container matColumnDef="lastLogin">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.users.lastLogin') }}</th>
            <td mat-cell *matCellDef="let u" [attr.data-label]="t('admin.users.lastLogin')">
              {{ (u.lastLoginAt | localDate) || noValue }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let u" class="cell-actions">
              <button
                mat-icon-button
                type="button"
                [matMenuTriggerFor]="menu"
                [matMenuTriggerData]="{ user: u }"
                [attr.aria-label]="t('actions.more')"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('admin.users.empty') }}</td>
          </tr>
        </table>
      </div>

      <mat-menu #menu="matMenu">
        <ng-template matMenuContent let-user="user">
          <button mat-menu-item type="button" (click)="edit(user)">
            <mat-icon>edit</mat-icon>
            <span>{{ t('actions.edit') }}</span>
          </button>
          @if (user.status === 'invited') {
            <button mat-menu-item type="button" (click)="resendInvite(user)">
              <mat-icon>send</mat-icon>
              <span>{{ t('admin.users.resendInvite') }}</span>
            </button>
          }
          @if (user.status === 'active') {
            <button mat-menu-item type="button" (click)="sendSignInLink(user)">
              <mat-icon>link</mat-icon>
              <span>{{ t('admin.users.sendSignInLink') }}</span>
            </button>
          }
          @if (user.twoFactorEnabled && user.id !== myId()) {
            <button mat-menu-item type="button" (click)="clearTwoFactor(user)">
              <mat-icon>remove_moderator</mat-icon>
              <span>{{ t('admin.users.clearTwoFactor') }}</span>
            </button>
          }
          @if (user.id !== myId()) {
            @if (user.status === 'disabled') {
              <button mat-menu-item type="button" (click)="setStatus(user, 'active')">
                <mat-icon>person</mat-icon>
                <span>{{ t('admin.users.enable') }}</span>
              </button>
            } @else {
              <button mat-menu-item type="button" (click)="setStatus(user, 'disabled')">
                <mat-icon>person_off</mat-icon>
                <span>{{ t('admin.users.disable') }}</span>
              </button>
            }
            <button mat-menu-item type="button" (click)="remove(user)">
              <mat-icon>delete</mat-icon>
              <span>{{ t('actions.delete') }}</span>
            </button>
          }
        </ng-template>
      </mat-menu>
    </ng-container>
  `,
  styles: `
    .cell-sub {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .two-factor {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .cell-actions {
      text-align: right;
      width: 56px;
    }
  `,
})
export class AdminUsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly branding = inject(BrandingService);
  private readonly auth = inject(AuthStore);

  /** What a cell shows where there is nothing to put in it. */
  readonly noValue = NO_VALUE;
  readonly columns = ['email', 'role', 'status', 'customer', 'lastLogin', 'actions'];
  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly myId = computed(() => this.auth.user()?.id);

  ngOnInit(): void {
    void this.load();
  }

  name(user: AdminUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { data } = await firstValueFrom(this.api.get<{ data: AdminUser[] }>('/admin/users'));
      this.users.set(data);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  invite(): void {
    const data: UserDialogData = {
      mode: 'invite',
      defaultLanguage: this.branding.branding().defaultLanguage,
    };
    this.dialog
      .open<UserDialogComponent, UserDialogData, UserDialogResult>(UserDialogComponent, { data })
      .afterClosed()
      .subscribe((result) => {
        if (!result || result.mode !== 'invite') return;
        void this.load();
        this.showInvite(result.result);
      });
  }

  edit(user: AdminUser): void {
    const data: UserDialogData = { mode: 'edit', user };
    this.dialog
      .open<UserDialogComponent, UserDialogData, UserDialogResult>(UserDialogComponent, { data })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.notify.success('admin.users.saved');
        void this.load();
      });
  }

  async resendInvite(user: AdminUser): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.api.post<InviteResult>(`/admin/users/${user.id}/resend-invite`),
      );
      void this.load();
      this.showInvite(result);
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /** For someone whose link never arrived: another one, valid for 15 minutes. */
  async sendSignInLink(user: AdminUser): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.api.post<SignInLinkResult>(`/admin/users/${user.id}/sign-in-link`),
      );
      if (result.mailSent) {
        this.notify.success('admin.users.signInLinkSent', { email: user.email });
      } else {
        this.openLink({
          titleKey: 'admin.users.signInLinkTitle',
          messageKey: 'admin.users.linkMessage',
          link: result.signInLink,
        });
      }
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  async setStatus(user: AdminUser, status: Extract<UserStatus, 'active' | 'disabled'>): Promise<void> {
    try {
      await firstValueFrom(this.api.patch<AdminUser>(`/admin/users/${user.id}`, { status }));
      this.notify.success('admin.users.saved');
      void this.load();
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /** For someone who lost the app and their recovery codes; their own account is not offered. */
  clearTwoFactor(user: AdminUser): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.users.clearTwoFactorTitle',
      messageKey: 'admin.users.clearTwoFactorMessage',
      params: { email: user.email },
      confirmKey: 'admin.users.clearTwoFactor',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.api.delete<void>(`/admin/users/${user.id}/two-factor`));
          this.notify.success('admin.users.twoFactorCleared');
          void this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  remove(user: AdminUser): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.users.deleteTitle',
      messageKey: 'admin.users.deleteMessage',
      params: { email: user.email },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.api.delete<void>(`/admin/users/${user.id}`));
          this.notify.success('admin.users.deleted');
          void this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  private showInvite(result: InviteResult): void {
    if (result.mailSent) {
      this.notify.success('admin.users.inviteSent', { email: result.user.email });
    } else {
      this.openLink({
        titleKey: 'admin.users.inviteLinkTitle',
        messageKey: 'admin.users.linkMessage',
        link: result.inviteLink,
      });
    }
  }

  private openLink(data: LinkDialogData): void {
    this.dialog.open<LinkDialogComponent, LinkDialogData>(LinkDialogComponent, { data });
  }
}
