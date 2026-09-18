import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { agentNumber } from '../../../core/hub/agent-id';
import { HubService } from '../../../core/hub/hub.service';
import type {
  AgentStats,
  AgentSummary,
  AnalyticsSummary,
  ChatbotStats,
  ChatbotSummary,
  DailyStat,
} from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { BarListComponent, type BarItem } from '../../../shared/bar-list.component';

const WINDOWS = [7, 30, 90] as const;

/** What the breakdown endpoints answer with; stats are null before the first activity. */
interface AgentStatsResponse {
  stats: AgentStats | null;
}
interface ChatbotStatsResponse {
  stats: ChatbotStats | null;
}
interface DailyResponse {
  data: DailyStat[];
}

/**
 * Usage over a window: what was consumed and charged, the calls per day, and
 * the lifetime figures of one agent or chatbot. Platform cost and margin are
 * deliberately left out; they belong to the operator, not to the customer.
 */
@Component({
  selector: 'app-analytics-page',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    BarListComponent,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.analytics.title') }}</h1>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="window">
          <mat-label>{{ t('user.analytics.window') }}</mat-label>
          <mat-select [ngModel]="days()" (ngModelChange)="setDays($event)" data-testid="analytics-window">
            @for (option of windows; track option) {
              <mat-option [value]="option">{{ t('user.analytics.lastDays', { count: option }) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="stat-row" data-testid="analytics-tiles">
        @for (metric of metrics(); track metric.usageType) {
          <div class="stat">
            <span class="stat-label">{{ usageLabel(t, metric.usageType) }}</span>
            <span class="stat-value">{{ number(metric.totalQuantity ?? 0) }}</span>
            <p class="stat-foot">
              {{ t('user.analytics.charged', { amount: money(metric.totalRevenue ?? 0) }) }}
            </p>
          </div>
        } @empty {
          <p class="hint">{{ t('user.analytics.noUsage') }}</p>
        }
      </div>

      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>{{ t('user.analytics.perDay') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-bar-list [items]="dailyBars()" [emptyText]="t('user.analytics.noCalls')" />
          @if (daily().length) {
            <div class="table-wrap">
              <table mat-table [dataSource]="daily()" class="daily" data-testid="analytics-daily">
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>{{ t('user.analytics.day') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.analytics.day')">
                    {{ row.date }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="calls">
                  <th mat-header-cell *matHeaderCellDef>{{ t('user.analytics.calls') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.analytics.calls')">
                    {{ row.callCount ?? 0 }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="successRate">
                  <th mat-header-cell *matHeaderCellDef>{{ t('user.analytics.successRate') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.analytics.successRate')">
                    {{ percent(row.successRate) }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="duration">
                  <th mat-header-cell *matHeaderCellDef>{{ t('user.analytics.averageDuration') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.analytics.averageDuration')">
                    {{ seconds(row.averageDuration) }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="dailyColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: dailyColumns"></tr>
              </table>
            </div>
          }
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>{{ t('user.analytics.breakdown') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (agents().length || chatbots().length) {
            <div class="pickers">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ t('nav.agents') }}</mat-label>
                <mat-select
                  [ngModel]="agentId()"
                  (ngModelChange)="selectAgent($event)"
                  data-testid="analytics-agent"
                >
                  <mat-option [value]="null">{{ t('user.analytics.noSelection') }}</mat-option>
                  @for (agent of agents(); track agent.id) {
                    <mat-option [value]="agent.id">{{ agent.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ t('nav.chatbots') }}</mat-label>
                <mat-select
                  [ngModel]="chatbotId()"
                  (ngModelChange)="selectChatbot($event)"
                  data-testid="analytics-chatbot"
                >
                  <mat-option [value]="null">{{ t('user.analytics.noSelection') }}</mat-option>
                  @for (chatbot of chatbots(); track chatbot.id) {
                    <mat-option [value]="chatbot.id">{{ chatbot.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          }

          @if (!agents().length && !chatbots().length) {
            <p class="hint" data-testid="analytics-nothing-to-pick">
              {{ t('user.analytics.nothingToPick') }}
            </p>
          } @else if (breakdown(); as stats) {
            <dl class="facts" data-testid="analytics-breakdown">
              <dt>{{ t('user.analytics.total') }}</dt>
              <dd>{{ stats.totalCalls ?? 0 }}</dd>
              <dt>{{ t('user.analytics.successful') }}</dt>
              <dd>{{ stats.successfulCalls ?? 0 }}</dd>
              <dt>{{ t('user.analytics.failed') }}</dt>
              <dd>{{ stats.failedCalls ?? 0 }}</dd>
              <dt>{{ t('user.analytics.averageDuration') }}</dt>
              <dd>{{ seconds(stats.averageDuration) }}</dd>
              <dt>{{ t('user.analytics.successRate') }}</dt>
              <dd>{{ percent(stats.successRate) }}</dd>
            </dl>
          } @else if (breakdownEmpty()) {
            <p class="hint" data-testid="analytics-breakdown-empty">
              {{ t('user.analytics.noActivity') }}
            </p>
          } @else {
            <p class="hint" data-testid="analytics-pick-one">{{ t('user.analytics.pickOne') }}</p>
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    .window {
      min-width: 200px;
    }
    .section {
      margin-bottom: 16px;
    }
    .daily {
      margin-top: 16px;
      width: 100%;
    }
    .pickers {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    /* Two pickers, not two banners: a select this wide reads as a headline. */
    .pickers mat-form-field {
      flex: 1 1 240px;
      max-width: 320px;
    }
    /* Grid and labels are shared; the figures line up on their digits here. */
    .facts dd {
      font-variant-numeric: tabular-nums;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
})
export class AnalyticsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly metrics = signal<NonNullable<AnalyticsSummary['metrics']>>([]);
  readonly daily = signal<DailyStat[]>([]);
  readonly agents = signal<AgentSummary[]>([]);
  readonly chatbots = signal<ChatbotSummary[]>([]);
  readonly breakdown = signal<AgentStats | ChatbotStats | null>(null);
  readonly breakdownEmpty = signal(false);
  readonly loading = signal(false);
  readonly days = signal<number>(30);
  readonly agentId = signal<string | null>(null);
  readonly chatbotId = signal<number | null>(null);

  readonly windows = WINDOWS;
  readonly dailyColumns = ['date', 'calls', 'successRate', 'duration'];

  readonly dailyBars = computed<BarItem[]>(() =>
    this.daily().map((day) => ({
      label: day.date ?? '',
      value: day.callCount ?? 0,
      caption: String(day.callCount ?? 0),
    })),
  );

  ngOnInit(): void {
    void this.load();
  }

  number(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 1 }).format(value);
  }

  money(value: number): string {
    return formatMoney(value, this.language.current());
  }

  percent(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat(this.language.current(), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(value > 1 ? value / 100 : value);
  }

  seconds(value: number | null | undefined): string {
    if (!value) return '';
    const total = Math.round(value);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  usageLabel(t: (key: string) => string, usageType: string | undefined): string {
    if (!usageType) return '';
    const key = `user.analytics.usage.${usageType}`;
    const label = t(key);
    return label && label !== key ? label : usageType;
  }

  setDays(days: number): void {
    this.days.set(days);
    void this.load();
  }

  async selectAgent(id: string | null): Promise<void> {
    this.agentId.set(id);
    this.chatbotId.set(null);
    this.breakdown.set(null);
    this.breakdownEmpty.set(false);
    if (id === null) return;
    await this.loadBreakdown(`/analytics/agents/${agentNumber(id)}`);
  }

  async selectChatbot(id: number | null): Promise<void> {
    this.chatbotId.set(id);
    this.agentId.set(null);
    this.breakdown.set(null);
    this.breakdownEmpty.set(false);
    if (id === null) return;
    await this.loadBreakdown(`/analytics/chatbots/${id}`);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - this.days());
      const [summary, daily, agents, chatbots] = await Promise.all([
        firstValueFrom(
          this.hub.get<AnalyticsSummary>('/analytics/summary', {
            from: isoDate(from),
            to: isoDate(new Date()),
          }),
        ),
        firstValueFrom(this.hub.get<DailyResponse>('/analytics/daily', { days: this.days() })),
        firstValueFrom(this.hub.list<AgentSummary>('/agents')),
        firstValueFrom(this.hub.list<ChatbotSummary>('/chatbots')),
      ]);
      this.metrics.set(summary.metrics ?? []);
      this.daily.set(daily.data);
      this.agents.set(agents);
      this.chatbots.set(chatbots);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadBreakdown(path: string): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.hub.get<AgentStatsResponse | ChatbotStatsResponse>(path));
      this.breakdown.set(result.stats);
      this.breakdownEmpty.set(result.stats === null);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}

/** The analytics window is bounded by calendar days, not timestamps. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
