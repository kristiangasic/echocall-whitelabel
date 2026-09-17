import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { HubNotification } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotificationsStore } from '../../../core/notifications/notifications.store';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

@Component({
  selector: 'app-notifications-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatPaginatorModule,
    MatProgressBarModule,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('user.notifications.title') }}</h1>
          <p class="page-hint">{{ t('user.notifications.hint') }}</p>
        </div>
        <button
          mat-stroked-button
          type="button"
          (click)="markAll()"
          [disabled]="busy() || notifications().length === 0"
          data-testid="notifications-read-all"
        >
          <mat-icon>done_all</mat-icon>
          {{ t('user.notifications.markAll') }}
        </button>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <mat-list data-testid="notifications-list">
        @for (item of notifications(); track item.id) {
          <mat-list-item [class.unread]="!item.isRead">
            <mat-icon matListItemIcon>{{ item.isRead ? 'mark_email_read' : 'mail' }}</mat-icon>
            <span matListItemTitle>{{ item.title }}</span>
            <span matListItemLine>{{ item.message }}</span>
            <span matListItemLine class="time">{{ item.createdAt | localDate: 'short' }}</span>
            @if (!item.isRead) {
              <button
                matListItemMeta
                mat-icon-button
                type="button"
                (click)="markRead(item)"
                [attr.aria-label]="t('user.notifications.markRead')"
                [attr.data-testid]="'notification-read-' + item.id"
              >
                <mat-icon>done</mat-icon>
              </button>
            }
          </mat-list-item>
        } @empty {
          <p class="empty">{{ t('user.notifications.empty') }}</p>
        }
      </mat-list>

      <mat-paginator
        [length]="total()"
        [pageSize]="perPage()"
        [pageIndex]="page() - 1"
        [pageSizeOptions]="[25, 50]"
        (page)="changePage($event)"
      />
    </ng-container>
  `,
  styles: `
    .unread {
      background: var(--mat-sys-surface-container-low);
    }
    .time {
      color: var(--mat-sys-on-surface-variant);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      padding: 16px;
    }
  `,
})
export class NotificationsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly store = inject(NotificationsStore);
  private readonly notify = inject(NotifyService);

  readonly notifications = signal<HubNotification[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(25);
  readonly total = signal(0);

  ngOnInit(): void {
    void this.load();
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async markRead(item: HubNotification): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.markRead(item.id);
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async markAll(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.markAllRead();
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.page<HubNotification>('/notifications', {
          page: this.page(),
          perPage: this.perPage(),
        }),
      );
      this.notifications.set(result.data);
      this.total.set(result.pagination?.total ?? result.data.length);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
