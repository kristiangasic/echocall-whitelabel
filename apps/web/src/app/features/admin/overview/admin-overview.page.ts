import { Component, inject, type OnInit, signal, type WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCredits, ResellerStats } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AdminOverview, HubStatus } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** One ticket of the operator's book; only the state decides whether it still needs attention. */
interface TicketRow {
  status: string;
}

/** How many tickets are still open, and whether a later page could hold more. */
interface OpenTickets {
  count: number;
  partial: boolean;
}

@Component({
  selector: 'app-admin-overview-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('admin.overview.title') }}</h1>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (loadError()) {
        <p role="alert">{{ t('errors.network') }}</p>
        <button mat-stroked-button type="button" (click)="load()">{{ t('actions.retry') }}</button>
      }
      @if (overview(); as o) {
        <!--
          The connection is not one figure among others: it decides whether the
          rest of the page means anything, so it runs across the top as the line
          the operator reads before looking any further.
        -->
        <section class="hub" [class.hub-bad]="!o.hub.ok" data-testid="hub-card">
          <mat-icon class="hub-icon" aria-hidden="true">{{
            o.hub.ok ? 'check_circle' : 'error'
          }}</mat-icon>
          <div class="hub-text">
            <p class="hub-title">{{ t('admin.overview.hub.title') }}</p>
            <p class="hub-status">
              {{
                o.hub.ok
                  ? t('admin.overview.hub.ok', { email: o.hub.email ?? '' })
                  : t('admin.overview.hub.failed')
              }}
            </p>
            @if (!o.hub.ok) {
              <p role="alert" class="hub-reason">
                {{ t(notify.errorKey(o.hub.error?.code ?? 'not_checked')) }}
                @if (o.hub.error?.code === 'no_active_subscription') {
                  {{ t('admin.overview.hub.subscriptionHint') }}
                  <a href="https://echocall.de" target="_blank" rel="noopener">echocall.de</a>
                } @else {
                  {{ t('admin.overview.hub.keyHint') }}
                }
              </p>
            }
            <p class="hub-checked">
              @if (o.hub.checkedAt) {
                {{ t('admin.overview.hub.checkedAt', { time: o.hub.checkedAt | localDate }) }}
              } @else {
                {{ t('errors.not_checked') }}
              }
            </p>
          </div>
          <button
            mat-stroked-button
            type="button"
            class="hub-action"
            (click)="recheck()"
            [disabled]="checking()"
            data-testid="recheck"
          >
            <mat-icon>refresh</mat-icon>
            {{ t('admin.overview.hub.recheck') }}
          </button>
        </section>

        <div class="stat-grid section" data-testid="operator-tiles">
          <a class="stat" routerLink="/admin/customers" data-testid="tile-customers">
            <span class="stat-label">{{ t('admin.overview.customers.title') }}</span>
            @if (stats(); as s) {
              <span class="stat-value">{{ number(s.totalCustomers) }}</span>
              <p class="stat-foot">
                {{ number(s.totalVoiceAgents) }} {{ t('admin.overview.customers.voiceAgents') }}
                &middot; {{ number(s.totalChatbots) }} {{ t('admin.overview.customers.chatbots') }}
              </p>
              <p class="stat-foot">{{ t('admin.overview.customers.usage') }}: {{ usageCost() }}</p>
            } @else {
              <span class="stat-value">&ndash;</span>
              <p class="stat-foot">{{ t('admin.overview.unavailable') }}</p>
            }
          </a>

          <a class="stat" routerLink="/admin/subscriptions" data-testid="tile-subscriptions">
            <span class="stat-label">{{ t('admin.overview.subscriptions.title') }}</span>
            <!-- A count of zero is an answer, not a gap: check for null, not for truth. -->
            @if (subscriptions() !== null) {
              <span class="stat-value">{{ subscriptions() }}</span>
              <p class="stat-foot">{{ t('admin.overview.subscriptions.total') }}</p>
            } @else {
              <span class="stat-value">&ndash;</span>
              <p class="stat-foot">{{ t('admin.overview.unavailable') }}</p>
            }
          </a>

          <div class="stat" data-testid="tile-balance">
            <span class="stat-label">{{ t('admin.overview.balance.title') }}</span>
            @if (balanceEur(); as amount) {
              <span class="stat-value">{{ amount }}</span>
            } @else {
              <span class="stat-value">&ndash;</span>
            }
            @if (credits(); as c) {
              <p class="stat-foot">
                {{ number(c.voiceMinutesAvailable) }} {{ t('admin.overview.balance.voiceMinutes') }}
                &middot; {{ number(c.chatMessagesAvailable) }}
                {{ t('admin.overview.balance.chatMessages') }}
              </p>
            } @else {
              <p class="stat-foot">{{ t('admin.overview.unavailable') }}</p>
            }
          </div>

          <a class="stat" routerLink="/admin/tickets" data-testid="tile-tickets">
            <span class="stat-label">{{ t('admin.overview.tickets.open') }}</span>
            @if (openTickets(); as tickets) {
              <span class="stat-value">{{ tickets.count }}{{ tickets.partial ? '+' : '' }}</span>
              <p class="stat-foot">{{ t('admin.overview.tickets.title') }}</p>
            } @else {
              <span class="stat-value">&ndash;</span>
              <p class="stat-foot">{{ t('admin.overview.unavailable') }}</p>
            }
          </a>
        </div>

        <section class="section">
          <div class="page-head">
            <h2 class="section-title">{{ t('admin.overview.users.title') }}</h2>
            <a mat-stroked-button routerLink="/admin/users">{{
              t('admin.overview.users.manage')
            }}</a>
          </div>
          <div class="stat-grid compact cols-6" data-testid="user-counts">
            <div class="stat">
              <span class="stat-label">{{ t('admin.overview.users.all') }}</span>
              <span class="stat-value">{{ o.users.total }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ t('roles.admin') }}</span>
              <span class="stat-value">{{ o.users.admins }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ t('roles.user') }}</span>
              <span class="stat-value">{{ o.users.users }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ t('statuses.active') }}</span>
              <span class="stat-value">{{ o.users.active }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ t('statuses.invited') }}</span>
              <span class="stat-value">{{ o.users.invited }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ t('statuses.disabled') }}</span>
              <span class="stat-value">{{ o.users.disabled }}</span>
            </div>
          </div>
        </section>
      }
    </ng-container>
  `,
  styles: `
    .hub {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      background: var(--mat-sys-surface-container-low);
    }
    .hub-icon {
      color: var(--mat-sys-primary);
      flex: none;
    }
    .hub-text {
      flex: 1;
      min-width: 0;
    }
    .hub-text p {
      margin: 0;
    }
    .hub-title {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .hub-status {
      font: var(--mat-sys-title-medium);
      overflow-wrap: anywhere;
    }
    .hub-checked,
    .hub-reason {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin-top: 2px;
    }
    .hub-action {
      flex: none;
    }
    .hub-bad {
      border-color: var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .hub-bad .hub-icon,
    .hub-bad .hub-title,
    .hub-bad .hub-reason,
    .hub-bad .hub-checked {
      color: inherit;
    }
    @media (max-width: 599px) {
      .hub {
        flex-wrap: wrap;
        padding: 16px;
      }
      .hub-action {
        width: 100%;
      }
    }
  `,
})
export class AdminOverviewPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly hub = inject(AdminHubService);
  private readonly language = inject(LanguageService);
  readonly notify = inject(NotifyService);

  readonly overview = signal<AdminOverview | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly checking = signal(false);

  /*
   * Every operator figure is its own signal, empty while it is missing. One hub
   * call that fails leaves a dash in its own tile and the rest of the page
   * standing, which is what an operator needs when the service has a bad minute.
   */
  readonly stats = signal<ResellerStats | null>(null);
  readonly credits = signal<ResellerCredits | null>(null);
  readonly balanceEur = signal<string | null>(null);
  readonly subscriptions = signal<number | null>(null);
  readonly openTickets = signal<OpenTickets | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  number(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 1 }).format(value);
  }

  /** The cost of the last thirty days of customer usage, or a dash while the service is quiet. */
  usageCost(): string {
    const cost = this.stats()?.thisMonthUsageCost;
    return cost === undefined ? '–' : formatMoney(cost, this.language.current());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.overview.set(await firstValueFrom(this.api.get<AdminOverview>('/admin/overview')));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
    await this.loadOperatorFigures();
  }

  /** Reads the operator tiles, each one on its own: a failure empties that tile alone. */
  private async loadOperatorFigures(): Promise<void> {
    await Promise.all([
      this.fill(this.stats, () => firstValueFrom(this.hub.get<ResellerStats>('/resellers/stats'))),
      this.fill(this.credits, () =>
        firstValueFrom(this.hub.get<ResellerCredits>('/resellers/credits/balance')),
      ),
      this.fill(this.balanceEur, async () => {
        const balance = await firstValueFrom(this.hub.get<{ balance: number }>('/resellers/balance'));
        return formatMoney(balance.balance, this.language.current());
      }),
      this.fill(this.subscriptions, async () => {
        const counted = await firstValueFrom(
          this.hub.get<{ count: number }>('/resellers/subscriptions/count'),
        );
        return counted.count;
      }),
      this.fill(this.openTickets, async () => {
        const page = await firstValueFrom(
          this.hub.page<TicketRow>('/resellers/tickets', { page: 1, perPage: 100 }),
        );
        const count = page.data.filter((ticket) => ticket.status !== 'closed').length;
        const total = page.pagination?.total ?? page.data.length;
        return { count, partial: total > page.data.length };
      }),
    ]);
  }

  /** Runs one tile's hub call and leaves that tile empty when it fails. */
  private async fill<T>(target: WritableSignal<T | null>, read: () => Promise<T>): Promise<void> {
    try {
      target.set(await read());
    } catch {
      target.set(null);
    }
  }

  async recheck(): Promise<void> {
    this.checking.set(true);
    try {
      const hub = await firstValueFrom(this.api.post<HubStatus>('/admin/overview/hub-check'));
      this.overview.update((current) => (current ? { ...current, hub } : current));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.checking.set(false);
    }
  }
}
