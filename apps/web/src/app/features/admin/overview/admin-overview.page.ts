import { Component, inject, type OnInit, signal, type WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCredits, ResellerStats, ResellerTicketRow } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AdminOverview, HubStatus } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** How many open tickets the overview lists before pointing at the full book. */
const TICKET_ROWS = 5;

/** The tickets that still need an answer: how many, the first few, and whether a later page could hold more. */
interface OpenTickets {
  count: number;
  partial: boolean;
  rows: ResellerTicketRow[];
}

@Component({
  selector: 'app-admin-overview-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('admin.overview.title') }}</h1>
      </div>
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
        <section class="strip section" [class.strip-bad]="!o.hub.ok" data-testid="hub-card">
          <div class="strip-item">
            <span class="strip-label">{{ t('admin.overview.hub.title') }}</span>
            <span>
              <span [class]="o.hub.ok ? 'status status-active' : 'status status-failed'">
                {{ o.hub.ok ? t('admin.overview.hub.connected') : t('admin.overview.hub.failed') }}
              </span>
            </span>
          </div>
          @if (o.hub.ok) {
            <div class="strip-item">
              <span class="strip-label">{{ t('admin.overview.hub.account') }}</span>
              <span class="strip-value">{{ o.hub.email || '–' }}</span>
            </div>
          }
          <div class="strip-item">
            <span class="strip-label">{{ t('admin.overview.hub.lastChecked') }}</span>
            <span class="strip-value">
              @if (o.hub.checkedAt) {
                {{ o.hub.checkedAt | localDate }}
              } @else {
                {{ t('errors.not_checked') }}
              }
            </span>
          </div>
          <div class="strip-actions">
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
          </div>
          @if (!o.hub.ok) {
            <p role="alert" class="strip-note">
              {{ t(notify.errorKey(o.hub.error?.code ?? 'not_checked')) }}
              @if (o.hub.error?.code === 'no_active_subscription') {
                {{ t('admin.overview.hub.subscriptionHint') }}
                <a href="https://echocall.de" target="_blank" rel="noopener">echocall.de</a>
              } @else {
                {{ t('admin.overview.hub.keyHint') }}
              }
            </p>
          }
        </section>

        <!--
          Every operator figure is its own panel, empty on its own when the
          service has a bad minute, so one failed call never blanks the page.
        -->
        <div class="panel-grid cols-4 section" data-testid="operator-tiles">
          <section class="panel" data-testid="tile-customers">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">groups</mat-icon>
                {{ t('admin.overview.customers.title') }}
              </h2>
            </div>
            @if (stats(); as s) {
              <div class="panel-figure">
                <span class="panel-number">{{ number(s.totalCustomers) }}</span>
              </div>
              <p class="panel-foot">
                {{ number(s.totalVoiceAgents) }} {{ t('admin.overview.customers.voiceAgents') }} &middot;
                {{ number(s.totalChatbots) }} {{ t('admin.overview.customers.chatbots') }}
              </p>
              <p class="panel-foot">
                {{ t('admin.overview.customers.usage') }}: <strong>{{ usageCost() }}</strong>
              </p>
            } @else {
              <div class="panel-figure"><span class="panel-number">&ndash;</span></div>
              <p class="panel-foot">{{ t('admin.overview.unavailable') }}</p>
            }
            <div class="panel-actions">
              <a mat-button routerLink="/admin/customers">{{ t('admin.overview.customers.manage') }}</a>
            </div>
          </section>

          <section class="panel" data-testid="tile-subscriptions">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">sell</mat-icon>
                {{ t('admin.overview.subscriptions.title') }}
              </h2>
            </div>
            <!-- A count of zero is an answer, not a gap: check for null, not for truth. -->
            @if (subscriptions() !== null) {
              <div class="panel-figure">
                <span class="panel-number">{{ subscriptions() }}</span>
              </div>
              <p class="panel-foot">{{ t('admin.overview.subscriptions.hint') }}</p>
            } @else {
              <div class="panel-figure"><span class="panel-number">&ndash;</span></div>
              <p class="panel-foot">{{ t('admin.overview.unavailable') }}</p>
            }
            <div class="panel-actions">
              <a mat-button routerLink="/admin/subscriptions">{{ t('admin.overview.subscriptions.all') }}</a>
            </div>
          </section>

          <section class="panel" data-testid="tile-balance">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">account_balance_wallet</mat-icon>
                {{ t('admin.overview.balance.title') }}
              </h2>
            </div>
            <div class="panel-figure">
              <span class="panel-number">{{ balanceEur() ?? '–' }}</span>
            </div>
            @if (credits(); as c) {
              <p class="panel-foot">
                {{ number(c.voiceMinutesAvailable) }} {{ t('admin.overview.balance.voiceMinutes') }} &middot;
                {{ number(c.chatMessagesAvailable) }} {{ t('admin.overview.balance.chatMessages') }}
              </p>
            } @else {
              <p class="panel-foot">{{ t('admin.overview.unavailable') }}</p>
            }
          </section>

          <section class="panel" data-testid="tile-users">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">manage_accounts</mat-icon>
                {{ t('admin.overview.users.title') }}
              </h2>
            </div>
            <div class="panel-figure">
              <span class="panel-number">{{ o.users.total }}</span>
            </div>
            <p class="panel-foot">
              {{ o.users.admins }} {{ t('roles.admin') }} &middot; {{ o.users.users }} {{ t('roles.user') }}
            </p>
            <p class="panel-foot">
              {{ o.users.active }} {{ t('statuses.active') }} &middot; {{ o.users.invited }}
              {{ t('statuses.invited') }} &middot; {{ o.users.disabled }} {{ t('statuses.disabled') }}
            </p>
            <div class="panel-actions">
              <a mat-button routerLink="/admin/users">{{ t('admin.overview.users.manage') }}</a>
            </div>
          </section>
        </div>

        <section class="section">
          <div class="page-head">
            <h2 class="section-title">
              {{ t('admin.overview.tickets.open') }}
              @if (openTickets(); as tickets) {
                <span class="count" data-testid="tile-tickets"
                  >{{ tickets.count }}{{ tickets.partial ? '+' : '' }}</span
                >
              }
            </h2>
            <a mat-stroked-button routerLink="/admin/tickets">{{ t('admin.overview.tickets.all') }}</a>
          </div>
          @if (openTickets(); as tickets) {
            <div class="table-wrap">
              <table mat-table [dataSource]="tickets.rows" data-testid="open-tickets">
                <ng-container matColumnDef="subject">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.subject') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.subject')">
                    <a class="row-link" [routerLink]="['/admin/tickets', row.id]">{{ row.subject }}</a>
                  </td>
                </ng-container>
                <ng-container matColumnDef="priority">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.priority') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.priority')">
                    @if (row.priority) {
                      {{ t('admin.tickets.priorities.' + row.priority) }}
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="updated">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.updated') }}</th>
                  <td
                    mat-cell
                    *matCellDef="let row"
                    [attr.data-label]="t('admin.tickets.updated')"
                    class="nowrap"
                  >
                    @if (row.updatedAt) {
                      {{ row.updatedAt | localDate }}
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
                    <span [class]="'status status-' + row.status">{{
                      t('admin.tickets.statuses.' + row.status)
                    }}</span>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"></tr>
                <tr class="mat-row" *matNoDataRow>
                  <td class="mat-cell empty" [attr.colspan]="columns.length">
                    {{ t('admin.overview.tickets.none') }}
                  </td>
                </tr>
              </table>
            </div>
          } @else {
            <p class="hint" data-testid="tile-tickets">{{ t('admin.overview.unavailable') }}</p>
          }
        </section>
      }
    </ng-container>
  `,
  styles: `
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    /* The number of tickets waiting, on the title of the list that shows them. */
    .count {
      display: inline-block;
      min-width: 24px;
      padding: 0 8px;
      border-radius: 12px;
      text-align: center;
      font: var(--mat-sys-label-medium);
      line-height: 24px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
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

  readonly columns = ['subject', 'priority', 'updated', 'status'];

  /*
   * Every operator figure is its own signal, empty while it is missing. One hub
   * call that fails leaves a dash in its own panel and the rest of the page
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
    // A service that answers without the figure, or with something that is not
    // one, leaves a dash in its place. The portal talks to installations it does
    // not control, and a panel reading NaN helps nobody.
    if (!Number.isFinite(value)) return '–';
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

  /** Reads the operator panels, each one on its own: a failure empties that panel alone. */
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
          this.hub.page<ResellerTicketRow>('/resellers/tickets', { page: 1, perPage: 100 }),
        );
        const open = page.data.filter((ticket) => ticket.status !== 'closed');
        const total = page.pagination?.total ?? page.data.length;
        return { count: open.length, partial: total > page.data.length, rows: open.slice(0, TICKET_ROWS) };
      }),
    ]);
  }

  /** Runs one panel's hub call and leaves that panel empty when it fails. */
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
