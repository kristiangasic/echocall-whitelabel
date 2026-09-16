import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { readApiError } from '../../../core/errors/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AccountOverview } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

@Component({
  selector: 'app-user-dashboard-page',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.dashboard.title') }}</h1>
        <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          {{ t('actions.refresh') }}
        </button>
      </div>
      <p class="intro">{{ t('user.dashboard.welcome', { name: displayName() }) }}</p>
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
        <div class="tiles" data-testid="tiles">
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-icon mat-card-avatar>call</mat-icon>
              <mat-card-title>{{ t('user.dashboard.voice.title') }}</mat-card-title>
              <mat-card-subtitle>{{ t('user.dashboard.thisPeriod') }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="figure">{{ number(o.usage.voiceMinutesUsed) }}</p>
              <p class="figure-label">{{ t('user.dashboard.voice.used') }}</p>
              @if (o.limits.voiceMinutesRemaining !== undefined) {
                <p class="hint">
                  {{ t('user.dashboard.voice.remaining', { count: number(o.limits.voiceMinutesRemaining) }) }}
                </p>
              }
              @if (o.limits.plan?.voiceMinutesPerMonth; as perMonth) {
                <p class="hint">{{ t('user.dashboard.voice.perMonth', { count: number(perMonth) }) }}</p>
              }
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-icon mat-card-avatar>chat</mat-icon>
              <mat-card-title>{{ t('user.dashboard.chat.title') }}</mat-card-title>
              <mat-card-subtitle>{{ t('user.dashboard.thisPeriod') }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="figure">{{ number(o.usage.chatSessionsUsed) }}</p>
              <p class="figure-label">{{ t('user.dashboard.chat.used') }}</p>
              @if (o.limits.chatConversationsRemaining !== undefined) {
                <p class="hint">
                  {{
                    t('user.dashboard.chat.remaining', { count: number(o.limits.chatConversationsRemaining) })
                  }}
                </p>
              }
              @if (o.limits.plan?.chatConversationsPerMonth; as perMonth) {
                <p class="hint">{{ t('user.dashboard.chat.perMonth', { count: number(perMonth) }) }}</p>
              }
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-icon mat-card-avatar>account_balance_wallet</mat-icon>
              <mat-card-title>{{ t('user.dashboard.balance.title') }}</mat-card-title>
              <mat-card-subtitle>{{ t('user.dashboard.balance.hint') }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="figure">{{ money(o.limits.balanceEur) }}</p>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-icon mat-card-avatar>workspace_premium</mat-icon>
              <mat-card-title>{{ t('user.dashboard.plan.title') }}</mat-card-title>
              <mat-card-subtitle>{{ statusLabel(o.limits.accountStatus) }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="figure figure-text">{{ o.limits.plan?.name || t('user.dashboard.plan.none') }}</p>
              @if (o.usage.period.from || o.usage.period.to) {
                <p class="hint">
                  {{
                    t('user.dashboard.period', {
                      from: o.usage.period.from | localDate: 'short',
                      to: o.usage.period.to | localDate: 'short',
                    })
                  }}
                </p>
              }
            </mat-card-content>
          </mat-card>
        </div>
      }
    </ng-container>
  `,
  styles: `
    .intro,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .hint {
      font: var(--mat-sys-body-small);
      margin: 4px 0 0;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 24px;
      align-items: start;
    }
    .figure {
      font: var(--mat-sys-display-small);
      font-variant-numeric: tabular-nums;
      margin: 8px 0 0;
    }
    .figure-text {
      font: var(--mat-sys-headline-small);
    }
    .figure-label {
      margin: 0;
      font: var(--mat-sys-label-large);
    }
    .notice mat-card-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 16px;
    }
    .notice mat-icon {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UserDashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  readonly notify = inject(NotifyService);

  readonly overview = signal<AccountOverview | null>(null);
  readonly loading = signal(false);
  readonly notLinked = signal(false);
  readonly errorCode = signal<string | null>(null);

  readonly displayName = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  });

  ngOnInit(): void {
    void this.load();
  }

  number(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 1 }).format(value);
  }

  money(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { style: 'currency', currency: 'EUR' }).format(
      value,
    );
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
    } finally {
      this.loading.set(false);
    }
  }
}
