import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AuthStore } from '../core/auth/auth.store';
import { BrandingService } from '../core/branding/branding.service';
import { LanguageService } from '../core/i18n/language.service';
import { LANGUAGES } from '../core/models';
import { FooterLinksComponent } from '../shared/footer-links.component';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  exact: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { path: '/admin', icon: 'dashboard', label: 'nav.overview', exact: true },
  { path: '/admin/users', icon: 'group', label: 'nav.users', exact: false },
  { path: '/admin/settings', icon: 'tune', label: 'nav.settings', exact: false },
  { path: '/admin/audit', icon: 'history', label: 'nav.audit', exact: false },
];

const USER_NAV: NavItem[] = [
  { path: '/app', icon: 'dashboard', label: 'nav.overview', exact: true },
  { path: '/account', icon: 'manage_accounts', label: 'nav.account', exact: false },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
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
    .shell-toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
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
    .active {
      --mat-list-list-item-label-text-color: var(--mat-sys-primary);
      --mat-list-list-item-leading-icon-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
      border-radius: 24px;
    }
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly language = inject(LanguageService);
  readonly branding = inject(BrandingService).branding;
  readonly languages = LANGUAGES;

  readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  readonly navItems = computed(() => (this.auth.user()?.role === 'admin' ? ADMIN_NAV : USER_NAV));

  readonly userLabel = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name ? `${name} (${user.email})` : user.email;
  });

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
