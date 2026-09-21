import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { readApiError } from '../../../core/errors/api-error';
import { formatMoney } from '../../../core/format/money';
import type { DailyStat } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AccountOverview } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  type AnyConversation,
  conversationDuration,
  conversationStatusLabel,
  conversationTitle,
  isChat,
} from '../conversations/conversation.model';

/** How many days of calls the overview draws. */
const CALL_DAYS = 30;

/** How much of a monthly allowance is gone, for the meter under a figure. */
interface Meter {
  used: number;
  total: number;
  remaining: number;
  percent: number;
}

/** The calls of one day in the window, zero on a day without any. */
interface DayCalls {
  date: string;
  calls: number;
}

interface DailyResponse {
  data?: DailyStat[];
}

/** The day in the form the service uses, YYYY-MM-DD, in the reader's own time zone. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A meter needs an allowance to measure against. An account that pays from its
 * balance has none, and "0 left" would read as a stop sign on an account that
 * can go on calling all month. A used figure the service left out measures
 * nothing either.
 */
function meterFor(
  used: number,
  total: number | null | undefined,
  remaining: number | undefined,
): Meter | null {
  if (!total || total <= 0 || !Number.isFinite(used)) return null;
  const left = remaining ?? Math.max(total - used, 0);
  return {
    used,
    total,
    remaining: Math.max(left, 0),
    percent: Math.min(100, Math.round((used / total) * 100)),
  };
}

@Component({
  selector: 'app-user-dashboard-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('user.dashboard.title') }}</h1>
          <p class="page-hint">{{ t('user.dashboard.welcome', { name: displayName() }) }}</p>
        </div>
        <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          {{ t('actions.refresh') }}
        </button>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (notLinked()) {
        <mat-card appearance="outlined" class="notice" data-testid="not-linked">
          <mat-card-content>
            <mat-icon>link_off</mat-icon>
            <span>{{ t('user.dashboard.notLinked') }}</span>
          </mat-card-content>
        </mat-card>
      } @else if (errorCode(); as code) {
        <mat-card appearance="outlined" class="notice" role="alert">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <span>{{ t(notify.errorKey(code)) }}</span>
          </mat-card-content>
        </mat-card>
      }
      @if (overview(); as o) {
        <!--
          The page reads top to bottom in the order a customer asks: what state
          is my account in, how much have I used, what happened last.
        -->
        <section class="strip section" data-testid="account">
          <div class="strip-item">
            <span class="strip-label">{{ t('user.dashboard.plan.title') }}</span>
            <span class="strip-value">{{ o.limits.plan?.name || t('user.dashboard.plan.none') }}</span>
          </div>
          @if (o.limits.accountStatus; as status) {
            <div class="strip-item">
              <span class="strip-label">{{ t('fields.status') }}</span>
              <span
                ><span [class]="'status status-' + status">{{ statusLabel(status) }}</span></span
              >
            </div>
          }
          <div class="strip-item">
            <span class="strip-label">{{ t('user.dashboard.balance.title') }}</span>
            <span class="strip-value">{{ money(o.limits.balanceEur) }}</span>
          </div>
          @if (o.usage.period.from || o.usage.period.to) {
            <div class="strip-item">
              <span class="strip-label">{{ t('user.dashboard.thisPeriod') }}</span>
              <span class="strip-value">
                {{
                  t('user.dashboard.periodRange', {
                    from: (o.usage.period.from | localDate: 'date'),
                    to: (o.usage.period.to | localDate: 'date'),
                  })
                }}
              </span>
            </div>
          }
          <div class="strip-actions">
            <a mat-stroked-button routerLink="/account">{{ t('user.dashboard.account') }}</a>
          </div>
        </section>

        <div class="panel-grid section" data-testid="tiles">
          <section class="panel" data-testid="voice-panel">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">call</mat-icon>
                {{ t('user.dashboard.voice.title') }}
              </h2>
              <a mat-button routerLink="/app/analytics">{{ t('nav.analytics') }}</a>
            </div>
            <div class="panel-figure">
              <span class="panel-number">{{ number(o.usage.voiceMinutesUsed) }}</span>
              <span class="panel-unit">{{ t('user.dashboard.voice.used') }}</span>
            </div>
            @if (voiceMeter(); as meter) {
              <div
                class="meter"
                [class.meter-full]="meter.percent >= 100"
                role="progressbar"
                [attr.aria-valuenow]="meter.percent"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="t('user.dashboard.voice.title')"
              >
                <span class="meter-fill" [style.width.%]="meter.percent"></span>
              </div>
              <div class="meter-legend">
                <span>{{ t('user.dashboard.voice.remaining', { count: number(meter.remaining) }) }}</span>
                <span>
                  {{
                    t('user.dashboard.voice.ofAllowance', {
                      percent: meter.percent,
                      count: number(meter.total),
                    })
                  }}
                </span>
              </div>
            } @else {
              <p class="panel-foot">{{ t('user.dashboard.fromBalance') }}</p>
            }
            @if (callsPerDay(); as days) {
              <div class="spark" data-testid="calls-per-day">
                @if (callTotal() > 0) {
                  <p class="panel-foot">
                    {{ t('user.dashboard.voice.perDay', { days: days.length }) }} &middot;
                    <strong>{{ t('user.dashboard.voice.calls', { count: number(callTotal()) }) }}</strong>
                  </p>
                  <div class="spark-bars" aria-hidden="true">
                    @for (day of days; track day.date) {
                      <span
                        class="spark-bar"
                        [class.zero]="day.calls === 0"
                        [style.height.%]="barHeight(day.calls)"
                        [title]="day.date + ': ' + day.calls"
                      ></span>
                    }
                  </div>
                } @else {
                  <p class="panel-foot">{{ t('user.dashboard.voice.noCalls', { days: days.length }) }}</p>
                }
              </div>
            }
          </section>

          <section class="panel" data-testid="chat-panel">
            <div class="panel-head">
              <h2 class="panel-title">
                <mat-icon aria-hidden="true">forum</mat-icon>
                {{ t('user.dashboard.chat.title') }}
              </h2>
              <a mat-button routerLink="/app/inbox">{{ t('user.conversations.openInbox') }}</a>
            </div>
            <div class="panel-figure">
              <span class="panel-number">{{ number(o.usage.chatSessionsUsed) }}</span>
              <span class="panel-unit">{{ t('user.dashboard.chat.used') }}</span>
            </div>
            @if (chatMeter(); as meter) {
              <div
                class="meter"
                [class.meter-full]="meter.percent >= 100"
                role="progressbar"
                [attr.aria-valuenow]="meter.percent"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="t('user.dashboard.chat.title')"
              >
                <span class="meter-fill" [style.width.%]="meter.percent"></span>
              </div>
              <div class="meter-legend">
                <span>{{ t('user.dashboard.chat.remaining', { count: number(meter.remaining) }) }}</span>
                <span>
                  {{
                    t('user.dashboard.chat.ofAllowance', {
                      percent: meter.percent,
                      count: number(meter.total),
                    })
                  }}
                </span>
              </div>
            } @else {
              <p class="panel-foot">{{ t('user.dashboard.fromBalance') }}</p>
            }
          </section>
        </div>

        <section class="section">
          <div class="page-head">
            <h2 class="section-title">{{ t('user.dashboard.recent.title') }}</h2>
            <a mat-stroked-button routerLink="/app/conversations">{{ t('user.dashboard.recent.all') }}</a>
          </div>
          <div class="table-wrap">
            <table mat-table [dataSource]="recent()" data-testid="recent-conversations">
              <ng-container matColumnDef="kind">
                <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.type') }}</th>
                <td mat-cell *matCellDef="let c" [attr.data-label]="t('user.conversations.type')">
                  <span class="kind">
                    <mat-icon aria-hidden="true">{{ isChat(c) ? 'forum' : 'call' }}</mat-icon>
                    {{ t('user.dashboard.kinds.' + c.type) }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="partner">
                <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.partner') }}</th>
                <td mat-cell *matCellDef="let c" [attr.data-label]="t('user.conversations.partner')">
                  <a class="row-link" [routerLink]="['/app/conversations', c.id]">{{ title(c) }}</a>
                </td>
              </ng-container>
              <ng-container matColumnDef="duration">
                <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.duration') }}</th>
                <td mat-cell *matCellDef="let c" [attr.data-label]="t('user.conversations.duration')">
                  {{ duration(c) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
                <td mat-cell *matCellDef="let c" [attr.data-label]="t('fields.status')">
                  @if (c.status) {
                    <span [class]="'status status-' + c.status">{{ statusOf(t, c) }}</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="started">
                <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.started') }}</th>
                <td
                  mat-cell
                  *matCellDef="let c"
                  [attr.data-label]="t('user.conversations.started')"
                  class="nowrap"
                >
                  {{ c.createdAt | localDate }}
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
              <tr class="mat-row" *matNoDataRow>
                <td class="mat-cell empty" [attr.colspan]="columns.length" data-testid="recent-empty">
                  {{ t('user.dashboard.recent.empty') }}
                </td>
              </tr>
            </table>
          </div>
        </section>
      }
    </ng-container>
  `,
  styles: `
    .notice mat-card-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 16px;
    }
    .notice mat-icon {
      color: var(--mat-sys-on-surface-variant);
    }
    /* Thirty thin bars, one per day, the tallest one the busiest day. */
    .spark {
      display: grid;
      gap: 6px;
      margin-top: 4px;
    }
    .spark-bars {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 40px;
    }
    .spark-bar {
      flex: 1 1 0;
      min-height: 2px;
      border-radius: 2px 2px 0 0;
      background: var(--mat-sys-primary);
    }
    .spark-bar.zero {
      background: var(--mat-sys-surface-container-high);
    }
    .kind {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .kind mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UserDashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly hub = inject(HubService);
  readonly notify = inject(NotifyService);

  readonly overview = signal<AccountOverview | null>(null);
  readonly recent = signal<AnyConversation[]>([]);
  /** Calls per day over the window, or null while the service has not said. */
  readonly callsPerDay = signal<DayCalls[] | null>(null);
  readonly loading = signal(false);
  readonly notLinked = signal(false);
  readonly errorCode = signal<string | null>(null);

  readonly columns = ['kind', 'partner', 'duration', 'status', 'started'];

  readonly displayName = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  });

  /**
   * The bar measures against what the period really started with: the plan's
   * allowance plus anything bought on top. Only an account whose hub does not
   * report that yet falls back to the plan's own figure.
   */
  readonly voiceMeter = computed(() => {
    const o = this.overview();
    if (!o) return null;
    return meterFor(
      o.usage.voiceMinutesUsed,
      o.limits.voiceMinutesAllowance ?? o.limits.plan?.voiceMinutesPerMonth,
      o.limits.voiceMinutesRemaining,
    );
  });

  readonly chatMeter = computed(() => {
    const o = this.overview();
    if (!o) return null;
    return meterFor(
      o.usage.chatSessionsUsed,
      o.limits.chatConversationsAllowance ?? o.limits.plan?.chatConversationsPerMonth,
      o.limits.chatConversationsRemaining,
    );
  });

  readonly callTotal = computed(() => (this.callsPerDay() ?? []).reduce((sum, day) => sum + day.calls, 0));

  private readonly callPeak = computed(() =>
    Math.max(0, ...(this.callsPerDay() ?? []).map((day) => day.calls)),
  );

  ngOnInit(): void {
    void this.load();
  }

  number(value: number): string {
    // The portal talks to installations it does not control, and a figure the
    // service left out reads as a dash, never as NaN.
    if (!Number.isFinite(value)) return '–';
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 1 }).format(value);
  }

  money(value: number): string {
    return formatMoney(value, this.language.current());
  }

  title(conversation: AnyConversation): string {
    return conversationTitle(conversation);
  }

  isChat(conversation: AnyConversation): boolean {
    return isChat(conversation);
  }

  /** A chat has no length, and a call the service could not time gets the same dash. */
  duration(conversation: AnyConversation): string {
    if (isChat(conversation)) return '–';
    return conversationDuration(conversation.duration) || '–';
  }

  statusOf(t: (key: string) => string, conversation: AnyConversation): string {
    return conversationStatusLabel(t, conversation);
  }

  /** The busiest day fills the chart's height; the others are drawn against it. */
  barHeight(calls: number): number {
    const peak = this.callPeak();
    return peak > 0 ? Math.round((calls / peak) * 100) : 0;
  }

  /** Translated when the portal knows the status, otherwise the value as the service reports it. */
  statusLabel(status: string | null): string {
    if (!status) return '';
    const key = `user.dashboard.statuses.${status}`;
    const translation = this.transloco.getTranslation(this.transloco.getActiveLang());
    return key in translation ? this.transloco.translate(key) : status;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.notLinked.set(false);
    this.errorCode.set(null);
    try {
      this.overview.set(await firstValueFrom(this.api.get<AccountOverview>('/account/overview')));
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'customer_not_linked') this.notLinked.set(true);
      else this.errorCode.set(error.code);
      this.loading.set(false);
      return;
    }
    await Promise.all([this.loadRecent(), this.loadCalls()]);
    this.loading.set(false);
  }

  /** A side panel, not the point of the page: a failure here leaves the figures standing. */
  private async loadRecent(): Promise<void> {
    try {
      const result = await firstValueFrom(this.hub.page<AnyConversation>('/conversations', { perPage: 5 }));
      this.recent.set(result.data);
    } catch {
      this.recent.set([]);
    }
  }

  /**
   * The chart is a courtesy. The service reports only the days that had a
   * call, so the window is laid out first and the counts dropped into it; an
   * installation that cannot answer the call keeps the rest of the page and
   * simply shows no chart.
   */
  private async loadCalls(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.get<DailyResponse>('/analytics/daily', { days: CALL_DAYS }),
      );
      const counts = new Map((result.data ?? []).map((row) => [row.date, row.callCount ?? 0]));
      const days: DayCalls[] = [];
      const cursor = new Date();
      cursor.setDate(cursor.getDate() - (CALL_DAYS - 1));
      for (let i = 0; i < CALL_DAYS; i++) {
        const key = dayKey(cursor);
        days.push({ date: key, calls: counts.get(key) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      this.callsPerDay.set(days);
    } catch {
      this.callsPerDay.set(null);
    }
  }
}
