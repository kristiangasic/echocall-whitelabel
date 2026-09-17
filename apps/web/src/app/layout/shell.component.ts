import { Component, computed, DestroyRef, inject, type OnInit } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth/auth.store';
import { BrandingService } from '../core/branding/branding.service';
import { LanguageService } from '../core/i18n/language.service';
import { LayoutService } from '../core/layout/layout.service';
import { LANGUAGES } from '../core/models';
import { NotificationsStore } from '../core/notifications/notifications.store';
import { startPolling } from '../core/polling/poll';
import { FooterLinksComponent } from '../shared/footer-links.component';

/** How often the bell asks the hub for unread notifications. */
const NOTIFICATION_POLL_MS = 60_000;

interface NavItem {
  path: string;
  icon: string;
  label: string;
  exact: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { path: '/admin', icon: 'dashboard', label: 'nav.overview', exact: true },
  { path: '/admin/customers', icon: 'groups', label: 'nav.customers', exact: false },
  { path: '/admin/plans', icon: 'sell', label: 'nav.plans', exact: false },
  { path: '/admin/subscriptions', icon: 'autorenew', label: 'nav.subscriptions', exact: false },
  { path: '/admin/addons', icon: 'add_shopping_cart', label: 'nav.addons', exact: false },
  { path: '/admin/invoices', icon: 'receipt_long', label: 'nav.invoices', exact: false },
  { path: '/admin/numbers', icon: 'dialpad', label: 'nav.numbers', exact: false },
  { path: '/admin/agents', icon: 'smart_toy', label: 'nav.customerAgents', exact: false },
  { path: '/admin/tickets', icon: 'support_agent', label: 'nav.tickets', exact: false },
  { path: '/admin/analytics', icon: 'insights', label: 'nav.analytics', exact: false },
  { path: '/admin/users', icon: 'group', label: 'nav.users', exact: false },
  { path: '/admin/settings', icon: 'tune', label: 'nav.settings', exact: false },
  { path: '/admin/audit', icon: 'history', label: 'nav.audit', exact: false },
];

const USER_NAV: NavItem[] = [
  { path: '/app', icon: 'dashboard', label: 'nav.overview', exact: true },
  { path: '/app/agents', icon: 'support_agent', label: 'nav.agents', exact: false },
  { path: '/app/chatbots', icon: 'forum', label: 'nav.chatbots', exact: false },
  { path: '/app/numbers', icon: 'call', label: 'nav.numbers', exact: false },
  { path: '/app/inbox', icon: 'inbox', label: 'nav.inbox', exact: false },
  { path: '/app/conversations', icon: 'chat', label: 'nav.conversations', exact: false },
  { path: '/app/analytics', icon: 'insights', label: 'nav.analytics', exact: false },
  { path: '/app/integrations', icon: 'extension', label: 'nav.integrations', exact: false },
  { path: '/app/webhooks', icon: 'webhook', label: 'nav.webhooks', exact: false },
  { path: '/app/campaigns', icon: 'campaign', label: 'nav.campaigns', exact: false },
  { path: '/app/tickets', icon: 'support', label: 'nav.tickets', exact: false },
  { path: '/account', icon: 'manage_accounts', label: 'nav.account', exact: false },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatBadgeModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    TranslocoDirective,
    FooterLinksComponent,
  ],
  template: `
    <mat-sidenav-container class="shell" *transloco="let t">
      <mat-sidenav
        #nav
        class="shell-nav"
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset()"
        [fixedInViewport]="isHandset()"
      >
        <div class="shell-brand">
          @if (branding().logoDataUrl; as logo) {
            <img class="shell-logo" [src]="logo" alt="" />
          } @else {
            <span class="shell-mark" aria-hidden="true"></span>
          }
          <span class="shell-name">{{ branding().productName }}</span>
        </div>
        <mat-nav-list>
          @for (item of navItems(); track item.path) {
            <a
              mat-list-item
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              (click)="isHandset() && nav.close()"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ t(item.label) }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content class="shell-content">
        <div class="shell-header" data-testid="shell-header">
          @if (impersonator()) {
            <div class="shell-impersonation" role="status" data-testid="impersonation-banner">
              <mat-icon aria-hidden="true">visibility</mat-icon>
              <span class="shell-impersonation-text">
                {{ t('impersonation.banner', { email: auth.user()?.email }) }}
              </span>
              <button
                mat-flat-button
                type="button"
                (click)="stopImpersonation()"
                data-testid="impersonation-stop"
              >
                {{ t('impersonation.back') }}
              </button>
            </div>
          }
          <mat-toolbar class="shell-toolbar">
            @if (isHandset()) {
              <button
                mat-icon-button
                type="button"
                (click)="nav.toggle()"
                [attr.aria-label]="t('nav.openMenu')"
              >
                <mat-icon>menu</mat-icon>
              </button>
            }
            <span class="shell-title">{{ branding().productName }}</span>
            <span class="shell-spacer"></span>
            <button
              mat-button
              type="button"
              [matMenuTriggerFor]="langMenu"
              [attr.aria-label]="t('nav.language')"
            >
              <mat-icon>language</mat-icon>
              {{ t('languages.' + language.current()) }}
            </button>
            <mat-menu #langMenu="matMenu">
              @for (lang of languages; track lang) {
                <button mat-menu-item type="button" (click)="language.change(lang)">
                  {{ t('languages.' + lang) }}
                </button>
              }
            </mat-menu>
            @if (showBell()) {
              <button
                mat-icon-button
                type="button"
                [matMenuTriggerFor]="bellMenu"
                (menuOpened)="refreshNotifications()"
                [attr.aria-label]="t('nav.notifications')"
                data-testid="notifications-bell"
              >
                <mat-icon
                  [matBadge]="unread()"
                  [matBadgeHidden]="unread() === 0"
                  matBadgeColor="warn"
                  matBadgeSize="small"
                >
                  notifications
                </mat-icon>
              </button>
              <mat-menu #bellMenu="matMenu" class="bell-menu">
                @for (item of preview(); track item.id) {
                  <a mat-menu-item routerLink="/app/notifications">
                    <span class="bell-title">{{ item.title }}</span>
                  </a>
                } @empty {
                  <span mat-menu-item disabled data-testid="bell-empty">
                    {{ t('nav.noNotifications') }}
                  </span>
                }
                <a mat-menu-item routerLink="/app/notifications" data-testid="bell-all">
                  <mat-icon>list</mat-icon>
                  <span>{{ t('nav.showAllNotifications') }}</span>
                </a>
              </mat-menu>
            }
            <button
              mat-icon-button
              type="button"
              [matMenuTriggerFor]="accountMenu"
              [attr.aria-label]="t('nav.accountMenu')"
              data-testid="account-menu"
            >
              <mat-icon>account_circle</mat-icon>
            </button>
            <mat-menu #accountMenu="matMenu">
              <div class="shell-user">{{ userLabel() }}</div>
              <a mat-menu-item routerLink="/account">
                <mat-icon>manage_accounts</mat-icon>
                <span>{{ t('nav.account') }}</span>
              </a>
              <button mat-menu-item type="button" (click)="logout()">
                <mat-icon>logout</mat-icon>
                <span>{{ t('nav.logout') }}</span>
              </button>
            </mat-menu>
          </mat-toolbar>
        </div>
        <main class="shell-main">
          <router-outlet />
        </main>
        <app-footer-links />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
    }
    .shell-nav {
      width: 260px;
      border-right: 1px solid var(--mat-sys-outline-variant);
    }
    .shell-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 16px 12px;
    }
    .shell-logo {
      max-height: 40px;
      max-width: 160px;
    }
    .shell-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--mat-sys-primary);
    }
    .shell-name {
      font: var(--mat-sys-title-medium);
    }
    /*
     * The banner belongs to the header, not to the page: an operator who has
     * scrolled past it is looking at someone else's portal with nothing left
     * on screen to say so.
     */
    .shell-header {
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .shell-toolbar {
      gap: 4px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .shell-title {
      font: var(--mat-sys-title-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .shell-spacer {
      flex: 1;
    }
    .shell-content {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .shell-main {
      flex: 1;
      padding: 24px 16px;
      max-width: 1200px;
      width: 100%;
      box-sizing: border-box;
      margin: 0 auto;
    }
    .shell-impersonation {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 16px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .shell-impersonation-text {
      flex: 1;
      min-width: 200px;
    }
    .shell-user {
      padding: 8px 16px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      margin-bottom: 4px;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bell-title {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .active {
      --mat-list-list-item-label-text-color: var(--mat-sys-primary);
      --mat-list-list-item-leading-icon-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
      border-radius: 24px;
    }
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationsStore);
  readonly language = inject(LanguageService);
  readonly branding = inject(BrandingService).branding;
  readonly languages = LANGUAGES;
  readonly unread = this.notifications.unread;
  readonly preview = this.notifications.preview;

  readonly isHandset = inject(LayoutService).isHandset;

  readonly navItems = computed(() => (this.auth.user()?.role === 'admin' ? ADMIN_NAV : USER_NAV));

  /** The bell reads the hub account, which only the workspace side uses. */
  readonly showBell = computed(() => this.auth.user()?.role !== 'admin');

  /** Set while an operator is viewing the portal as one of their customers. */
  readonly impersonator = this.auth.impersonator;

  ngOnInit(): void {
    if (!this.showBell()) return;
    void this.refreshNotifications();
    startPolling(this.destroyRef, NOTIFICATION_POLL_MS, () => this.notifications.refresh());
  }

  async refreshNotifications(): Promise<void> {
    await this.notifications.refresh();
  }

  readonly userLabel = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name ? `${name} (${user.email})` : user.email;
  });

  /**
   * Hands the session back to the operator. When their account is gone the
   * session ends instead, and the portal returns to the login page.
   */
  async stopImpersonation(): Promise<void> {
    try {
      await this.auth.stopImpersonation();
      await this.router.navigateByUrl('/admin');
    } catch {
      this.auth.clear();
      await this.router.navigateByUrl('/login');
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
