import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { readApiError } from '../../../core/errors/api-error';
import { formatMoney } from '../../../core/format/money';
import type { Conversation } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AccountOverview } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { conversationTitle } from '../conversations/conversation.model';

@Component({
  selector: 'app-user-dashboard-page',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    RouterLink,
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
      <p class="page-hint">{{ t('user.dashboard.welcome', { name: displayName() }) }}</p>
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
        <div class="stat-grid section" data-testid="tiles">
          <div class="stat">
            <span class="stat-label">{{ t('user.dashboard.voice.title') }}</span>
            <span class="stat-value">{{ number(o.usage.voiceMinutesUsed) }}</span>
            <p class="stat-foot">{{ t('user.dashboard.voice.used') }}</p>
            <!--
              A remainder of zero is not a fact about this account: an account
              that pays from its balance has no monthly allowance to have left
              over, and "0 minutes left" would read as a stop sign.
            -->
            @if (o.limits.voiceMinutesRemaining) {
              <p class="stat-foot">
                {{ t('user.dashboard.voice.remaining', { count: number(o.limits.voiceMinutesRemaining) }) }}
              </p>
            }
            @if (o.limits.plan?.voiceMinutesPerMonth; as perMonth) {
              <p class="stat-foot">{{ t('user.dashboard.voice.perMonth', { count: number(perMonth) }) }}</p>
            }
          </div>

          <div class="stat">
            <span class="stat-label">{{ t('user.dashboard.chat.title') }}</span>
            <span class="stat-value">{{ number(o.usage.chatSessionsUsed) }}</span>
            <p class="stat-foot">{{ t('user.dashboard.chat.used') }}</p>
            @if (o.limits.chatConversationsRemaining) {
              <p class="stat-foot">
                {{
                  t('user.dashboard.chat.remaining', { count: number(o.limits.chatConversationsRemaining) })
                }}
              </p>
            }
            @if (o.limits.plan?.chatConversationsPerMonth; as perMonth) {
              <p class="stat-foot">{{ t('user.dashboard.chat.perMonth', { count: number(perMonth) }) }}</p>
            }
          </div>

          <div class="stat">
            <span class="stat-label">{{ t('user.dashboard.balance.title') }}</span>
            <span class="stat-value">{{ money(o.limits.balanceEur) }}</span>
            <p class="stat-foot">{{ t('user.dashboard.balance.hint') }}</p>
          </div>

          <div class="stat">
            <span class="stat-label">{{ t('user.dashboard.plan.title') }}</span>
            <span class="stat-value plan">{{ o.limits.plan?.name || t('user.dashboard.plan.none') }}</span>
            <p class="stat-foot">{{ statusLabel(o.limits.accountStatus) }}</p>
            @if (o.usage.period.from || o.usage.period.to) {
              <p class="stat-foot">
                {{
                  t('user.dashboard.period', {
                    from: o.usage.period.from | localDate: 'date',
                    to: o.usage.period.to | localDate: 'date',
                  })
                }}
              </p>
            }
          </div>
        </div>

        <mat-card appearance="outlined" class="recent">
          <mat-card-header>
            <mat-card-title>{{ t('user.dashboard.recent.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('user.dashboard.recent.hint') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (recent().length) {
              <mat-nav-list data-testid="recent-conversations">
                @for (conversation of recent(); track conversation.id) {
                  <a mat-list-item [routerLink]="['/app/conversations', conversation.id]">
                    <span matListItemTitle>{{ title(conversation) }}</span>
                    <span matListItemLine>{{ conversation.createdAt | localDate: 'short' }}</span>
                  </a>
                }
              </mat-nav-list>
            } @else {
              <p class="empty" data-testid="recent-empty">{{ t('user.dashboard.recent.empty') }}</p>
            }
          </mat-card-content>
          <mat-card-actions>
            <a mat-button routerLink="/app/conversations">{{ t('user.dashboard.recent.all') }}</a>
            <a mat-button routerLink="/app/inbox">{{ t('user.conversations.openInbox') }}</a>
          </mat-card-actions>
        </mat-card>
      }
    </ng-container>
  `,
  styles: `
    .hint {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    /* A plan name is words, not a figure, so it does not take the digit face. */
    .stat-value.plan {
      font: var(--mat-sys-title-large);
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
    .recent {
      margin-top: 24px;
    }
    /* The empty line stands where the list would, not under the list's indent. */
    .recent .empty {
      margin: 0;
    }
  `,
})
export class UserDashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  readonly notify = inject(NotifyService);

  private readonly hub = inject(HubService);

  readonly overview = signal<AccountOverview | null>(null);
  readonly recent = signal<Conversation[]>([]);
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
    return formatMoney(value, this.language.current());
  }

  title(conversation: Conversation): string {
    return conversationTitle(conversation);
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
    await this.loadRecent();
    this.loading.set(false);
  }

  /** A side panel, not the point of the page: a failure here leaves the tiles standing. */
  private async loadRecent(): Promise<void> {
    try {
      const result = await firstValueFrom(this.hub.page<Conversation>('/conversations', { perPage: 5 }));
      this.recent.set(result.data);
    } catch {
      this.recent.set([]);
    }
  }
}
