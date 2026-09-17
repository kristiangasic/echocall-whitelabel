import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { Webhook } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LinkDialogComponent, type LinkDialogData } from '../../../shared/link-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { parseEvents } from './webhook-events';
import {
  WebhookDialogComponent,
  type WebhookDialogData,
  type WebhookDialogResult,
} from './webhook-dialog.component';

/** What a test delivery reports back. */
interface TestDelivery {
  data: { delivered: boolean; status?: number; error?: string };
}

/**
 * The endpoints this account receives events on. Deliveries are signed, and
 * the signing secret is only ever shown once, right after an endpoint is
 * registered.
 */
@Component({
  selector: 'app-webhooks-page',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.webhooks.title') }}</h1>
        <button mat-flat-button type="button" (click)="create()" data-testid="webhooks-create">
          <mat-icon>add</mat-icon>
          {{ t('user.webhooks.create') }}
        </button>
      </div>
      <p class="hint">{{ t('user.webhooks.hint') }}</p>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="table-wrap">
        <table mat-table [dataSource]="webhooks()" data-testid="webhooks-table">
          <ng-container matColumnDef="url">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.webhooks.url') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.webhooks.url')">
              <span class="url">{{ row.url }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="events">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.webhooks.events') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.webhooks.events')">
              <mat-chip-set>
                @for (event of events(row); track event) {
                  <mat-chip>{{ event === '*' ? t('user.webhooks.allEvents') : event }}</mat-chip>
                }
              </mat-chip-set>
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <mat-chip-set>
                <mat-chip [highlighted]="row.isActive">
                  {{ t(row.isActive ? 'user.webhooks.active' : 'user.webhooks.inactive') }}
                </mat-chip>
              </mat-chip-set>
              @if (row.failedDeliveries) {
                <span class="sub">
                  {{ t('user.webhooks.failures', { count: row.failedDeliveries }) }}
                </span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="lastDelivery">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.webhooks.lastDelivery') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.webhooks.lastDelivery')">
              @if (row.lastDeliveryAt) {
                {{ row.lastDeliveryAt | localDate: 'short' }}
                <span class="sub">{{ row.lastDeliveryStatus }}</span>
              } @else {
                {{ t('user.webhooks.never') }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="row-actions">
              <button
                mat-icon-button
                type="button"
                (click)="test(row)"
                [disabled]="busy()"
                [matTooltip]="t('user.webhooks.test')"
                [attr.aria-label]="t('user.webhooks.test')"
                [attr.data-testid]="'webhook-test-' + row.id"
              >
                <mat-icon>bolt</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="edit(row)"
                [matTooltip]="t('actions.edit')"
                [attr.aria-label]="t('actions.edit')"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="remove(row)"
                [matTooltip]="t('actions.delete')"
                [attr.aria-label]="t('actions.delete')"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('user.webhooks.empty') }}
            </td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
  styles: `
    table {
      width: 100%;
    }
    .url {
      word-break: break-all;
    }
    .sub {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .row-actions {
      white-space: nowrap;
      text-align: right;
    }
    .empty,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WebhooksPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly webhooks = signal<Webhook[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly columns = ['url', 'events', 'status', 'lastDelivery', 'actions'];

  ngOnInit(): void {
    void this.load();
  }

  events(webhook: Webhook): string[] {
    return parseEvents(webhook.events);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.webhooks.set(await firstValueFrom(this.hub.list<Webhook>('/webhooks')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const result = await this.openDialog({});
    if (!result) return;
    if (result.secret) this.showSecret(result.secret);
    await this.load();
  }

  async edit(webhook: Webhook): Promise<void> {
    const result = await this.openDialog({ webhook });
    if (result) await this.load();
  }

  async test(webhook: Webhook): Promise<void> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.hub.post<TestDelivery>(`/webhooks/${webhook.id}/test`));
      if (result.data.delivered) this.notify.success('user.webhooks.testOk');
      else this.notify.error('user.webhooks.testFailed');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(webhook: Webhook): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.webhooks.deleteTitle',
      messageKey: 'user.webhooks.deleteMessage',
      params: { url: webhook.url },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.delete(`/webhooks/${webhook.id}`));
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  /** The secret signs every delivery and is never returned again, so it is shown right away. */
  private showSecret(secret: string): void {
    const data: LinkDialogData = {
      titleKey: 'user.webhooks.secretTitle',
      messageKey: 'user.webhooks.secretMessage',
      link: secret,
    };
    this.dialog.open(LinkDialogComponent, { data });
  }

  private openDialog(data: WebhookDialogData): Promise<WebhookDialogResult | undefined> {
    return firstValueFrom(
      this.dialog
        .open<WebhookDialogComponent, WebhookDialogData, WebhookDialogResult>(WebhookDialogComponent, {
          data,
        })
        .afterClosed(),
    );
  }
}
