import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerSubscriptionRow } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import { SubscriptionDialogComponent } from './subscription-dialog.component';

const DEFAULT_PER_PAGE = 25;

/** The states the hub reports; the filter offers them and nothing else. */
const STATUSES = ['active', 'past_due', 'canceled', 'paused', 'expired'] as const;

/**
 * Which customer pays for which plan, and until when. Ending a subscription is
 * two different actions here: one lets the term run out, the other stops it on
 * the spot, and neither is a shortcut for the other.
 */
@Component({
  selector: 'app-admin-subscriptions-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.subscriptions.title') }}</h1>
          <p class="page-hint">{{ t('admin.subscriptions.intro') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="create()" data-testid="create">
          <mat-icon>add</mat-icon>
          {{ t('admin.subscriptions.create') }}
        </button>
      </div>
      <mat-form-field appearance="outline" class="filter">
        <mat-label>{{ t('admin.subscriptions.filter') }}</mat-label>
        <mat-select [value]="status()" (valueChange)="setStatus($event)" data-testid="status-filter">
          <mat-option value="">{{ t('admin.subscriptions.allStatuses') }}</mat-option>
          @for (name of statuses; track name) {
            <mat-option [value]="name">{{ t('admin.subscriptions.statuses.' + name) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()" data-testid="subscriptions-table">
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.customer') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.subscriptions.customer')">
              <div>{{ customerName(row) }}</div>
              @if (row.customer?.name && row.customer?.email) {
                <div class="cell-sub">{{ row.customer.email }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="plan">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.plan') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.subscriptions.plan')">
              @if (row.plan) {
                {{ row.plan.name }}
              } @else {
                <span class="cell-sub">{{ t('admin.subscriptions.planGone') }}</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="price">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.price') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.subscriptions.price')"
              class="numeric"
            >
              @if (row.plan) {
                {{ money(row.plan.priceEur) }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="term">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.term') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.subscriptions.term')"
              class="nowrap"
            >
              @if (row.subscription.contractDuration) {
                {{ t('admin.subscriptions.months', { count: row.subscription.contractDuration }) }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="start">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.start') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.subscriptions.start')"
              class="nowrap"
            >
              {{ row.subscription.startDate | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="end">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.subscriptions.end') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.subscriptions.end')"
              class="nowrap"
            >
              {{ row.subscription.endDate | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + row.subscription.status">
                {{ t('admin.subscriptions.statuses.' + row.subscription.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="cell-actions">
              @if (row.subscription.status === 'active' || row.subscription.status === 'past_due') {
                <button
                  mat-icon-button
                  type="button"
                  [matMenuTriggerFor]="menu"
                  [matMenuTriggerData]="{ row: row }"
                  [attr.aria-label]="t('actions.more')"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('admin.subscriptions.empty') }}
            </td>
          </tr>
        </table>
      </div>
      @if (total() > perPage()) {
        <mat-paginator
          [length]="total()"
          [pageIndex]="page() - 1"
          [pageSize]="perPage()"
          [pageSizeOptions]="[25, 50, 100]"
          (page)="onPage($event)"
        />
      }

      <mat-menu #menu="matMenu">
        <ng-template matMenuContent let-row="row">
          <button mat-menu-item type="button" (click)="cancel(row, false)" data-testid="cancel">
            <mat-icon>event_busy</mat-icon>
            <span>{{ t('admin.subscriptions.cancel') }}</span>
          </button>
          <button mat-menu-item type="button" (click)="cancel(row, true)" data-testid="cancel-now">
            <mat-icon>block</mat-icon>
            <span>{{ t('admin.subscriptions.cancelImmediate') }}</span>
          </button>
        </ng-template>
      </mat-menu>
    </ng-container>
  `,
  styles: `
    .filter {
      width: 220px;
      margin-bottom: 8px;
    }
    .cell-sub {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .cell-actions {
      text-align: right;
      width: 56px;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AdminSubscriptionsPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly columns = ['customer', 'plan', 'price', 'term', 'start', 'end', 'status', 'actions'];
  readonly statuses = STATUSES;
  readonly rows = signal<ResellerSubscriptionRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(DEFAULT_PER_PAGE);
  readonly status = signal('');
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** The name of the customer, or the address when the hub knows no name. */
  customerName(row: ResellerSubscriptionRow): string {
    return row.customer?.name || row.customer?.email || String(row.subscription.customerId);
  }

  /** A narrower filter can leave the current page empty, so filtering starts over. */
  setStatus(status: string): void {
    this.status.set(status);
    this.page.set(1);
    void this.load();
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const status = this.status();
      const result = await firstValueFrom(
        this.hub.page<ResellerSubscriptionRow>('/resellers/subscriptions', {
          page: this.page(),
          perPage: this.perPage(),
          ...(status ? { status } : {}),
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

  create(): void {
    this.dialog
      .open<SubscriptionDialogComponent, unknown, boolean>(SubscriptionDialogComponent, { data: {} })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.notify.success('admin.subscriptions.created');
        void this.load();
      });
  }

  /**
   * Ends a subscription. With notice it keeps running for another 30 days; at
   * once it stops now, nothing is refunded, and there is no way back, which the
   * confirmation says before it happens.
   */
  cancel(row: ResellerSubscriptionRow, immediate: boolean): void {
    const data: ConfirmDialogData = {
      titleKey: immediate ? 'admin.subscriptions.cancelImmediateTitle' : 'admin.subscriptions.cancelTitle',
      messageKey: immediate
        ? 'admin.subscriptions.cancelImmediateMessage'
        : 'admin.subscriptions.cancelMessage',
      params: { customer: this.customerName(row) },
      confirmKey: immediate ? 'admin.subscriptions.cancelImmediate' : 'admin.subscriptions.cancel',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        const path = immediate ? 'cancel-immediate' : 'cancel';
        try {
          await firstValueFrom(this.hub.post(`/resellers/subscriptions/${row.subscription.id}/${path}`));
          this.notify.success(immediate ? 'admin.subscriptions.endedNow' : 'admin.subscriptions.canceled');
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }
}
