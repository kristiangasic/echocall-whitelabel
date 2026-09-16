import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { AdminOverview, HubStatus } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

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
  `,
})
export class AdminOverviewPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly notify = inject(NotifyService);

  readonly overview = signal<AdminOverview | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly checking = signal(false);

  ngOnInit(): void {
    void this.load();
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
