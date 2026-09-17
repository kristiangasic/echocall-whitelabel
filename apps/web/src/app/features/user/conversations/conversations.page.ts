import { DatePipe } from '@angular/common';
import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { Conversation, LiveConversation } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { conversationTitle, type AnyConversation } from './conversation.model';
import { providePaginatorIntl } from '../../../shared/paginator-intl';

@Component({
  selector: 'app-conversations-page',
  imports: [
    DatePipe,
    MatTableModule,
    MatButtonToggleModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.conversations.title') }}</h1>
        <a mat-stroked-button routerLink="/app/inbox">
          <mat-icon>forum</mat-icon>
          {{ t('user.conversations.openInbox') }}
        </a>
      </div>

      <mat-button-toggle-group
        [value]="type()"
        (change)="setType($event.value)"
        data-testid="conversation-type"
        [attr.aria-label]="t('user.conversations.type')"
      >
        <mat-button-toggle value="voice">{{ t('user.conversations.types.voice') }}</mat-button-toggle>
        <mat-button-toggle value="chat">{{ t('user.conversations.types.chat') }}</mat-button-toggle>
      </mat-button-toggle-group>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()" data-testid="conversations-table">
          <ng-container matColumnDef="partner">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.partner') }}</th>
            <td mat-cell *matCellDef="let c">
              <a class="row-link" [routerLink]="['/app/conversations', c.id]">{{ title(c) }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="started">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.started') }}</th>
            <td mat-cell *matCellDef="let c">
              {{ (c.startedAt || c.createdAt | date: 'short') || '' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="duration">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.conversations.duration') }}</th>
            <td mat-cell *matCellDef="let c">{{ duration(c.duration) }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let c">
              <span class="status" [class]="'status status-' + c.status">{{ statusLabel(t, c) }}</span>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('user.conversations.empty') }}
            </td>
          </tr>
        </table>
      </div>
      <mat-paginator
        [length]="total()"
        [pageSize]="perPage()"
        [pageIndex]="page() - 1"
        [pageSizeOptions]="[25, 50, 100]"
        (page)="changePage($event)"
      />
    </ng-container>
  `,
  styles: `
    .row-link {
      color: inherit;
      text-decoration: none;
      font-weight: 500;
    }
    .row-link:hover {
      text-decoration: underline;
    }
    mat-button-toggle-group {
      margin-bottom: 16px;
    }
  `,
})
export class ConversationsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly rows = signal<AnyConversation[]>([]);
  readonly loading = signal(false);
  readonly type = signal<'voice' | 'chat'>('voice');
  readonly page = signal(1);
  readonly perPage = signal(25);
  readonly total = signal(0);
  readonly columns = ['partner', 'started', 'duration', 'status'];

  ngOnInit(): void {
    const type = this.route.snapshot.queryParamMap.get('type');
    if (type === 'chat') this.type.set('chat');
    void this.load();
  }

  title(conversation: AnyConversation): string {
    return conversationTitle(conversation);
  }

  statusLabel(t: (key: string) => string, conversation: AnyConversation): string {
    const status = conversation.status;
    if (!status) return '';
    const key = `user.conversations.statuses.${status}`;
    const label = t(key);
    return label && label !== key ? label : status;
  }

  duration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  setType(type: 'voice' | 'chat'): void {
    this.type.set(type);
    this.page.set(1);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { type } });
    void this.load();
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.page<Conversation | LiveConversation>('/conversations', {
          type: this.type(),
          page: this.page(),
          perPage: this.perPage(),
        }),
      );
      this.rows.set(result.data);
      this.total.set(result.pagination?.total ?? result.data.length);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
