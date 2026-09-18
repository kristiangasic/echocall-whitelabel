import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerRevenueAnalytics, ResellerUsageAnalytics } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { BarListComponent, type BarItem } from '../../../shared/bar-list.component';

const WINDOWS = [7, 30, 90] as const;

/**
 * What the customer base consumed in a window and what the operator earned on
 * it. The hub answers with totals rather than a daily series, so the page shows
 * the totals as tiles and the chat and voice shares as bars: that is the split
 * the operator prices against.
 */
@Component({
  selector: 'app-admin-analytics-page',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatSelectModule,
    BarListComponent,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.analytics.title') }}</h1>
          <p class="page-hint">{{ t('admin.analytics.intro') }}</p>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="window">
          <mat-label>{{ t('admin.analytics.window') }}</mat-label>
          <mat-select [ngModel]="days()" (ngModelChange)="setDays($event)" data-testid="analytics-window">
            @for (option of windows; track option) {
              <mat-option [value]="option">{{ t('admin.analytics.lastDays', { count: option }) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <!--
        Four figures, four columns, and two of them carry the line that explains
        them: what was used on the left, what it earned on the right.
      -->
      <div class="stat-grid" data-testid="analytics-tiles">
        <div class="stat">
          <span class="stat-label">{{ t('admin.analytics.chatSessions') }}</span>
          <span class="stat-value">{{ number(usage()?.totalChatSessions ?? 0) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('admin.analytics.voiceMinutes') }}</span>
          <span class="stat-value">{{ number(usage()?.totalVoiceMinutes ?? 0) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('admin.analytics.revenue') }}</span>
          <span class="stat-value">{{ money(usage()?.totalRevenue ?? 0) }}</span>
          <p class="stat-foot">
            {{ t('admin.analytics.platformCost') }}: {{ money(usage()?.totalBaseCost ?? 0) }}
          </p>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('admin.analytics.margin') }}</span>
          <span class="stat-value">{{ money(usage()?.totalMargin ?? 0) }}</span>
          <p class="stat-foot">
            {{ t('admin.analytics.marginNote', { percent: percent(revenue()?.marginPercent ?? 0) }) }}
          </p>
        </div>
      </div>

      @if (empty()) {
        <div class="section">
          <p class="hint empty-panel" data-testid="analytics-empty">{{ t('admin.analytics.noUsage') }}</p>
        </div>
      } @else {
        <div class="splits section">
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ t('admin.analytics.revenueSplit') }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <app-bar-list [items]="revenueBars(t)" [emptyText]="t('admin.analytics.noUsage')" />
            </mat-card-content>
          </mat-card>
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ t('admin.analytics.costSplit') }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <app-bar-list [items]="costBars(t)" [emptyText]="t('admin.analytics.noUsage')" />
            </mat-card-content>
          </mat-card>
        </div>
      }

      <p class="hint">{{ t('admin.analytics.billedNote') }}</p>
    </ng-container>
  `,
  styles: `
    .window {
      min-width: 200px;
    }
    .splits {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 899px) {
      .splits {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 16px 0 0;
    }
  `,
})
export class AdminAnalyticsPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly windows = WINDOWS;
  readonly usage = signal<ResellerUsageAnalytics | null>(null);
  readonly revenue = signal<ResellerRevenueAnalytics | null>(null);
  readonly days = signal<number>(30);
  readonly loading = signal(false);

  /** Nothing was consumed, which is worth saying rather than showing five zeroes silently. */
  readonly empty = computed(() => {
    const usage = this.usage();
    return usage !== null && (usage.totalChatSessions ?? 0) === 0 && (usage.totalVoiceMinutes ?? 0) === 0;
  });

  ngOnInit(): void {
    void this.load();
  }

  number(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 1 }).format(value);
  }

  money(value: number): string {
    return formatMoney(value, this.language.current());
  }

  /** The hub reports the margin as a percentage already, so it is only formatted. */
  percent(value: number): string {
    return new Intl.NumberFormat(this.language.current(), {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);
  }

  revenueBars(t: (key: string) => string): BarItem[] {
    const usage = this.usage();
    return [
      { label: t('admin.analytics.chat'), value: usage?.chatSessionRevenue ?? 0 },
      { label: t('admin.analytics.voice'), value: usage?.voiceMinuteRevenue ?? 0 },
    ].map((bar) => ({ ...bar, caption: this.money(bar.value) }));
  }

  costBars(t: (key: string) => string): BarItem[] {
    const usage = this.usage();
    return [
      { label: t('admin.analytics.chat'), value: usage?.chatSessionCost ?? 0 },
      { label: t('admin.analytics.voice'), value: usage?.voiceMinuteCost ?? 0 },
    ].map((bar) => ({ ...bar, caption: this.money(bar.value) }));
  }

  setDays(days: number): void {
    this.days.set(days);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - this.days());
      const window = { startDate: isoDate(from), endDate: isoDate(to) };
      const [usage, revenue] = await Promise.all([
        firstValueFrom(this.hub.get<ResellerUsageAnalytics>('/resellers/analytics/usage', window)),
        firstValueFrom(this.hub.get<ResellerRevenueAnalytics>('/resellers/analytics/revenue', window)),
      ]);
      this.usage.set(usage);
      this.revenue.set(revenue);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}

/** The window is bounded by calendar days, which is what the hub parses. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
