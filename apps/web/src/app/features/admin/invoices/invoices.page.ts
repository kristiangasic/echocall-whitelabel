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
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCustomer, ResellerInvoiceRow } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import { type CustomerOption, customerOption } from '../customer-option';
import { InvoiceDialogComponent, type InvoiceDialogResult } from './invoice-dialog.component';
import { INVOICE_STATUSES, invoiceStatusLabel } from './invoice-status';

const DEFAULT_PER_PAGE = 25;

/** How many customers the filter loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/** An invoice that has not gone out yet is the only one that can be recorded as sent. */
const SENDABLE = new Set(['draft']);

/** A payment can still be recorded on anything that is not settled or dropped. */
const PAYABLE = new Set(['draft', 'sent', 'failed', 'overdue']);

/**
 * The invoices an operator raises against their own customers. The portal only
 * keeps the record: it sends nothing and collects nothing, so both row actions
 * are about writing down what happened elsewhere.
 */
@Component({
  selector: 'app-admin-invoices-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.invoices.title') }}</h1>
          <p class="page-hint">{{ t('admin.invoices.intro') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="create()" data-testid="create">
          <mat-icon>add</mat-icon>
          {{ t('admin.invoices.create') }}
        </button>
      </div>
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>{{ t('admin.invoices.filter') }}</mat-label>
          <mat-select [value]="status()" (valueChange)="setStatus($event)" data-testid="status-filter">
            <mat-option value="">{{ t('admin.invoices.allStatuses') }}</mat-option>
            @for (name of statuses; track name) {
              <mat-option [value]="name">{{ t('admin.invoices.statuses.' + name) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ t('admin.invoices.customerFilter') }}</mat-label>
          <mat-select
            [value]="customerId()"
            (valueChange)="setCustomer($event)"
            data-testid="customer-filter"
          >
            <mat-option [value]="0">{{ t('admin.invoices.allCustomers') }}</mat-option>
            @for (customer of customers(); track customer.id) {
              <mat-option [value]="customer.id">{{ customer.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()" data-testid="invoices-table">
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.number') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.invoices.number')" class="nowrap">
              <a class="row-link" [routerLink]="['/admin/invoices', row.invoice.id]">{{
                row.invoice.invoiceNumber
              }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.customer') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.invoices.customer')">
              <div>{{ customerName(row) }}</div>
              @if (row.customer?.name && row.customer?.email) {
                <div class="cell-sub">{{ row.customer.email }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.date') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.invoices.date')" class="nowrap">
              {{ row.invoice.issuedDate | localDate: 'date' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="due">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.due') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.invoices.due')" class="nowrap">
              {{ row.invoice.dueDate | localDate: 'date' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.total') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.invoices.total')" class="numeric">
              {{ money(row.invoice.totalEur) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + row.invoice.status">
                {{ statusLabel(row.invoice.status, t) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="cell-actions">
              @if (canMarkSent(row) || canMarkPaid(row)) {
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
              {{ t(filtered() ? 'admin.invoices.noMatch' : 'admin.invoices.empty') }}
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
          @if (canMarkSent(row)) {
            <button mat-menu-item type="button" (click)="markSent(row)" data-testid="mark-sent">
              <mat-icon>outgoing_mail</mat-icon>
              <span>{{ t('admin.invoices.markSent') }}</span>
            </button>
          }
          @if (canMarkPaid(row)) {
            <button mat-menu-item type="button" (click)="markPaid(row)" data-testid="mark-paid">
              <mat-icon>paid</mat-icon>
              <span>{{ t('admin.invoices.markPaid') }}</span>
            </button>
          }
        </ng-template>
      </mat-menu>
    </ng-container>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 8px;
    }
    .filters mat-form-field {
      width: 240px;
      max-width: 100%;
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
export class AdminInvoicesPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly columns = ['number', 'customer', 'date', 'due', 'total', 'status', 'actions'];
  readonly statuses = INVOICE_STATUSES;
  readonly rows = signal<ResellerInvoiceRow[]>([]);
  readonly customers = signal<CustomerOption[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(DEFAULT_PER_PAGE);
  readonly status = signal('');
  /** The customer the list is narrowed to, or 0 for all of them. */
  readonly customerId = signal(0);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
    void this.loadCustomers();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** The name of the customer, or the address when the hub knows no name. */
  customerName(row: ResellerInvoiceRow): string {
    return row.customer?.name || row.customer?.email || String(row.invoice.userId);
  }

  /** True while the list shows a part of the invoices rather than all of them. */
  filtered(): boolean {
    return this.status() !== '' || this.customerId() !== 0;
  }

  /** Named here so the template can reach it; the rule itself is shared. */
  statusLabel(status: string | null | undefined, t: (key: string) => string): string {
    return invoiceStatusLabel(status, t);
  }

  canMarkSent(row: ResellerInvoiceRow): boolean {
    return SENDABLE.has(row.invoice.status ?? '');
  }

  canMarkPaid(row: ResellerInvoiceRow): boolean {
    return PAYABLE.has(row.invoice.status ?? '');
  }

  /** A narrower filter can leave the current page empty, so filtering starts over. */
  setStatus(status: string): void {
    this.status.set(status);
    this.page.set(1);
    void this.load();
  }

  setCustomer(customerId: number): void {
    this.customerId.set(customerId);
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
      const customerId = this.customerId();
      const result = await firstValueFrom(
        this.hub.page<ResellerInvoiceRow>('/resellers/invoices', {
          page: this.page(),
          perPage: this.perPage(),
          ...(status ? { status } : {}),
          ...(customerId ? { customerId } : {}),
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

  /**
   * The customer filter is a convenience, not the page itself, so a hub that
   * cannot answer it leaves the filter at "all customers" without an alarm.
   */
  private async loadCustomers(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.page<ResellerCustomer>('/resellers/customers', { perPage: CUSTOMER_PAGE }),
      );
      this.customers.set(result.data.map(customerOption));
    } catch {
      this.customers.set([]);
    }
  }

  create(): void {
    this.dialog
      .open<InvoiceDialogComponent, unknown, InvoiceDialogResult>(InvoiceDialogComponent, {
        data: {},
        panelClass: 'dialog-wide',
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.notify.success('admin.invoices.created', { number: created.invoiceNumber });
        void this.load();
      });
  }

  /** Records that the invoice went out to the customer. Nothing is sent by this. */
  async markSent(row: ResellerInvoiceRow): Promise<void> {
    try {
      await firstValueFrom(this.hub.post(`/resellers/invoices/${row.invoice.id}/mark-sent`));
      this.notify.success('admin.invoices.markedSent');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /**
   * Records a payment collected elsewhere. The hub writes the status whatever
   * the current one is and stamps the payment date, and there is no way back,
   * so the confirmation names the invoice before it happens.
   */
  markPaid(row: ResellerInvoiceRow): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.invoices.markPaidTitle',
      messageKey: 'admin.invoices.markPaidMessage',
      params: { number: row.invoice.invoiceNumber },
      confirmKey: 'admin.invoices.markPaid',
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.hub.post(`/resellers/invoices/${row.invoice.id}/mark-paid`));
          this.notify.success('admin.invoices.markedPaid');
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }
}
