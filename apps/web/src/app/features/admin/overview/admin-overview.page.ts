import { Component, inject, type OnInit, signal, type WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
    MatCardModule,
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
        <div class="cards">
          <mat-card
            appearance="outlined"
            [class.hub-ok]="o.hub.ok"
            [class.hub-bad]="!o.hub.ok"
            data-testid="hub-card"
          >
            <mat-card-header>
              <mat-icon mat-card-avatar class="hub-icon">{{ o.hub.ok ? 'check_circle' : 'error' }}</mat-icon>
              <mat-card-title>{{ t('admin.overview.hub.title') }}</mat-card-title>
              <mat-card-subtitle>
                {{
                  o.hub.ok
                    ? t('admin.overview.hub.ok', { email: o.hub.email ?? '' })
                    : t('admin.overview.hub.failed')
                }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (!o.hub.ok) {
                <p role="alert" class="hub-error">
                  {{ t(notify.errorKey(o.hub.error?.code ?? 'not_checked')) }}
                </p>
                @if (o.hub.error?.code === 'no_active_subscription') {
                  <p class="hint">
                    {{ t('admin.overview.hub.subscriptionHint') }}
                    <a href="https://echocall.de" target="_blank" rel="noopener">echocall.de</a>
                  </p>
                } @else {
                  <p class="hint">{{ t('admin.overview.hub.keyHint') }}</p>
                }
              }
              <p class="hint">
                @if (o.hub.checkedAt) {
                  {{ t('admin.overview.hub.checkedAt', { time: o.hub.checkedAt | localDate }) }}
                } @else {
                  {{ t('errors.not_checked') }}
                }
              </p>
            </mat-card-content>
            <mat-card-actions>
              <button
                mat-stroked-button
                type="button"
                (click)="recheck()"
                [disabled]="checking()"
                data-testid="recheck"
              >
                <mat-icon>refresh</mat-icon>
                {{ t('admin.overview.hub.recheck') }}
              </button>
            </mat-card-actions>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-icon mat-card-avatar>group</mat-icon>
              <mat-card-title>{{ t('admin.overview.users.title') }}</mat-card-title>
              <mat-card-subtitle>{{
                t('admin.overview.users.total', { count: o.users.total })
              }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <dl class="counts">
                <div>
                  <dt>{{ t('roles.admin') }}</dt>
                  <dd>{{ o.users.admins }}</dd>
                </div>
                <div>
                  <dt>{{ t('roles.user') }}</dt>
                  <dd>{{ o.users.users }}</dd>
                </div>
                <div>
                  <dt>{{ t('statuses.active') }}</dt>
                  <dd>{{ o.users.active }}</dd>
                </div>
                <div>
                  <dt>{{ t('statuses.invited') }}</dt>
                  <dd>{{ o.users.invited }}</dd>
                </div>
                <div>
                  <dt>{{ t('statuses.disabled') }}</dt>
                  <dd>{{ o.users.disabled }}</dd>
                </div>
              </dl>
            </mat-card-content>
            <mat-card-actions>
              <a mat-button routerLink="/admin/users">{{ t('admin.overview.users.manage') }}</a>
            </mat-card-actions>
          </mat-card>
        </div>
      }

      <div class="cards operator" data-testid="operator-tiles">
        <mat-card appearance="outlined" data-testid="tile-customers">
          <mat-card-header>
            <mat-icon mat-card-avatar>groups</mat-icon>
            <mat-card-title>{{ t('admin.overview.customers.title') }}</mat-card-title>
            <mat-card-subtitle>
              {{ t('admin.overview.customers.usage') }}: {{ usageCost() }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (stats(); as s) {
              <p class="figure">{{ s.totalCustomers }}</p>
              <p class="figure-label">{{ t('admin.overview.customers.customers') }}</p>
              <dl class="counts">
                <div>
                  <dt>{{ t('admin.overview.customers.voiceAgents') }}</dt>
                  <dd>{{ s.totalVoiceAgents }}</dd>
                </div>
                <div>
                  <dt>{{ t('admin.overview.customers.chatbots') }}</dt>
                  <dd>{{ s.totalChatbots }}</dd>
                </div>
              </dl>
            } @else {
              <p class="figure">&ndash;</p>
              <p class="hint">{{ t('admin.overview.unavailable') }}</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" data-testid="tile-balance">
          <mat-card-header>
            <mat-icon mat-card-avatar>account_balance_wallet</mat-icon>
            <mat-card-title>{{ t('admin.overview.balance.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('admin.overview.balance.credit') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (balanceEur(); as amount) {
              <p class="figure">{{ amount }}</p>
            } @else {
              <p class="figure">&ndash;</p>
            }
            @if (credits(); as c) {
              <dl class="counts">
                <div>
                  <dt>{{ t('admin.overview.balance.voiceMinutes') }}</dt>
                  <dd>{{ number(c.voiceMinutesAvailable) }}</dd>
                </div>
                <div>
                  <dt>{{ t('admin.overview.balance.chatMessages') }}</dt>
                  <dd>{{ number(c.chatMessagesAvailable) }}</dd>
                </div>
              </dl>
            } @else {
              <p class="hint">{{ t('admin.overview.unavailable') }}</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" data-testid="tile-subscriptions">
          <mat-card-header>
            <mat-icon mat-card-avatar>workspace_premium</mat-icon>
            <mat-card-title>{{ t('admin.overview.subscriptions.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('admin.overview.subscriptions.total') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <!-- A count of zero is an answer, not a gap: check for null, not for truth. -->
            @if (subscriptions() !== null) {
              <p class="figure">{{ subscriptions() }}</p>
            } @else {
              <p class="figure">&ndash;</p>
              <p class="hint">{{ t('admin.overview.unavailable') }}</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" data-testid="tile-tickets">
          <mat-card-header>
            <mat-icon mat-card-avatar>support_agent</mat-icon>
            <mat-card-title>{{ t('admin.overview.tickets.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('admin.overview.tickets.open') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (openTickets(); as tickets) {
              <p class="figure">{{ tickets.count }}{{ tickets.partial ? '+' : '' }}</p>
            } @else {
              <p class="figure">&ndash;</p>
              <p class="hint">{{ t('admin.overview.unavailable') }}</p>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </ng-container>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      align-items: start;
    }
    .hub-ok .hub-icon {
      color: var(--mat-sys-primary);
    }
    .hub-bad .hub-icon,
    .hub-error {
      color: var(--mat-sys-error);
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .counts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px;
      margin: 0;
    }
    .counts dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .counts dd {
      margin: 0;
      font: var(--mat-sys-headline-small);
      font-variant-numeric: tabular-nums;
    }
    .operator {
      margin-top: 24px;
    }
    .figure {
      font: var(--mat-sys-display-small);
      font-variant-numeric: tabular-nums;
      margin: 8px 0 0;
    }
    .figure-label {
      margin: 0 0 8px;
      font: var(--mat-sys-label-large);
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
    return cost === undefined ? '\u2013' : formatMoney(cost, this.language.current());
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
