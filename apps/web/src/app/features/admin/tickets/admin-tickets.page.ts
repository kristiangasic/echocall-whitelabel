import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCustomer, ResellerTicketRow } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import { type CustomerOption, customerOption } from '../customer-option';

const DEFAULT_PER_PAGE = 25;

/** How many customers the filter loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/** The states the hub stores on a ticket; the filter offers them and nothing else. */
const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;

/**
 * Every support request raised by any customer of the portal. The list is the
 * operator's inbox: it answers what came in and who it came from, and the row
 * leads to the conversation where the answering happens.
 */
@Component({
  selector: 'app-admin-tickets-page',
  imports: [
    MatFormFieldModule,
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
          <h1 class="page-title">{{ t('admin.tickets.title') }}</h1>
          <p class="page-hint">{{ t('admin.tickets.intro') }}</p>
        </div>
      </div>
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>{{ t('admin.tickets.filter') }}</mat-label>
          <mat-select [value]="status()" (valueChange)="setStatus($event)" data-testid="status-filter">
            <mat-option value="">{{ t('admin.tickets.allStatuses') }}</mat-option>
            @for (name of statuses; track name) {
              <mat-option [value]="name">{{ t('admin.tickets.statuses.' + name) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ t('admin.tickets.customerFilter') }}</mat-label>
          <mat-select
            [value]="customerId()"
            (valueChange)="setCustomer($event)"
            data-testid="customer-filter"
          >
            <mat-option [value]="0">{{ t('admin.tickets.allCustomers') }}</mat-option>
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
        <table mat-table [dataSource]="rows()" data-testid="tickets-table">
          <ng-container matColumnDef="subject">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.subject') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.subject')">
              <a [routerLink]="['/admin/tickets', row.id]">{{ row.subject }}</a>
              @if (row.assignedToAdmin) {
                <span class="badge">{{ t('admin.tickets.escalatedBadge') }}</span>
              }
              <div class="cell-sub">{{ t('admin.tickets.categories.' + row.category) }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.customer') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.customer')">
              {{ customerName(row) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="priority">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.priority') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.priority')">
              <span class="priority" [class]="'priority priority-' + row.priority">
                {{ t('admin.tickets.priorities.' + row.priority) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.created') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.created')" class="nowrap">
              {{ row.createdAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="updated">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.tickets.updated') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.tickets.updated')" class="nowrap">
              {{ row.updatedAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + row.status">
                {{ t('admin.tickets.statuses.' + row.status) }}
              </span>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('admin.tickets.empty') }}
            </td>
          </tr>
        </table>
      </div>
      <mat-paginator
        [length]="total()"
        [pageIndex]="page() - 1"
        [pageSize]="perPage()"
        [pageSizeOptions]="[25, 50, 100]"
        (page)="onPage($event)"
      />
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
    .badge {
      margin-left: 8px;
      padding: 2px 8px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      white-space: nowrap;
    }
    .priority-high,
    .priority-urgent {
      font-weight: 600;
      color: var(--mat-sys-error);
    }
    .nowrap {
      white-space: nowrap;
    }
    .empty {
      padding: 24px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminTicketsPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);

  readonly columns = ['subject', 'customer', 'priority', 'created', 'updated', 'status'];
  readonly statuses = STATUSES;
  readonly rows = signal<ResellerTicketRow[]>([]);
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

  /**
   * A ticket row carries the customer as an id only, so the name comes from the
   * same list the filter uses. Without that list the id still identifies the
   * customer, which beats an empty column.
   */
  customerName(row: ResellerTicketRow): string {
    const customer = this.customers().find((option) => option.id === row.userId);
    return customer?.label ?? String(row.userId);
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
        this.hub.page<ResellerTicketRow>('/resellers/tickets', {
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
   * The customer list is what turns an id into a name and what fills the filter.
   * It is a convenience, not the page itself, so a hub that cannot answer it
   * leaves the column showing ids rather than failing the whole inbox.
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
}
