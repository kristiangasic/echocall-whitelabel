import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { readApiError } from '../../../core/errors/api-error';
import { formatMoney, formatUnitPrice } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerInvoiceDetail } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/**
 * One invoice with everything it charges for. The amounts are the ones the hub
 * stored when the invoice was raised, not a sum worked out here: an invoice
 * that has gone out must keep saying what it said then.
 */
@Component({
  selector: 'app-admin-invoice-detail-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <a mat-button routerLink="/admin/invoices" class="back">
        <mat-icon>arrow_back</mat-icon>
        {{ t('admin.invoices.detail.back') }}
      </a>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (missing()) {
        <p role="alert" data-testid="missing">{{ t('admin.invoices.detail.notFound') }}</p>
      }
      @if (detail(); as d) {
        <div class="page-head">
          <div>
            <h1 class="page-title">{{ d.invoice.invoiceNumber }}</h1>
            @if (d.invoice.description) {
              <p class="page-hint">{{ d.invoice.description }}</p>
            }
          </div>
          <span class="status" [class]="'status status-' + d.invoice.status">
            {{ t('admin.invoices.statuses.' + d.invoice.status) }}
          </span>
        </div>

        <dl class="facts panel">
          <div>
            <dt>{{ t('admin.invoices.detail.customer') }}</dt>
            <dd>
              @if (d.customer) {
                {{ d.customer.name || d.customer.email }}
                @if (d.customer.name && d.customer.email) {
                  <span class="sub">{{ d.customer.email }}</span>
                }
              } @else {
                <span class="sub">{{ t('admin.invoices.detail.customerGone') }}</span>
              }
            </dd>
          </div>
          <div>
            <dt>{{ t('admin.invoices.detail.issued') }}</dt>
            <dd>{{ d.invoice.issuedDate | localDate: 'date' }}</dd>
          </div>
          @if (d.invoice.dueDate) {
            <div>
              <dt>{{ t('admin.invoices.detail.due') }}</dt>
              <dd>{{ d.invoice.dueDate | localDate: 'date' }}</dd>
            </div>
          }
          @if (d.invoice.paidDate) {
            <div>
              <dt>{{ t('admin.invoices.detail.paid') }}</dt>
              <dd>{{ d.invoice.paidDate | localDate: 'date' }}</dd>
            </div>
          }
          @if (period(d); as span) {
            <div>
              <dt>{{ t('admin.invoices.detail.period') }}</dt>
              <dd>{{ span }}</dd>
            </div>
          }
        </dl>

        <h2 class="section-title">{{ t('admin.invoices.detail.items') }}</h2>
        @if (d.items.length) {
          <div class="table-wrap">
            <table mat-table [dataSource]="d.items" data-testid="items-table">
              <ng-container matColumnDef="description">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.detail.description') }}</th>
                <td
                  mat-cell
                  *matCellDef="let item"
                  [attr.data-label]="t('admin.invoices.detail.description')"
                >
                  {{ item.description }}
                </td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.detail.type') }}</th>
                <td mat-cell *matCellDef="let item" [attr.data-label]="t('admin.invoices.detail.type')">
                  {{ t('admin.invoices.itemTypes.' + item.itemType) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="quantity">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.detail.quantity') }}</th>
                <td
                  mat-cell
                  *matCellDef="let item"
                  [attr.data-label]="t('admin.invoices.detail.quantity')"
                  class="numeric"
                >
                  {{ quantity(item.quantity) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="unitPrice">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.detail.unitPrice') }}</th>
                <td
                  mat-cell
                  *matCellDef="let item"
                  [attr.data-label]="t('admin.invoices.detail.unitPrice')"
                  class="numeric"
                >
                  {{ unitPrice(item.unitPrice) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.invoices.detail.amount') }}</th>
                <td
                  mat-cell
                  *matCellDef="let item"
                  [attr.data-label]="t('admin.invoices.detail.amount')"
                  class="numeric"
                >
                  {{ money(item.amount) }}
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let item; columns: columns"></tr>
            </table>
          </div>
        } @else {
          <p class="empty" data-testid="items-empty">{{ t('admin.invoices.detail.noItems') }}</p>
        }

        <dl class="totals" data-testid="totals">
          <div>
            <dt>{{ t('admin.invoices.net') }}</dt>
            <dd>{{ money(d.invoice.subtotalEur) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.invoices.tax') }}</dt>
            <dd>{{ money(d.invoice.taxEur) }}</dd>
          </div>
          <div class="gross">
            <dt>{{ t('admin.invoices.total') }}</dt>
            <dd>{{ money(d.invoice.totalEur) }}</dd>
          </div>
        </dl>
      }
    </ng-container>
  `,
  styles: `
    .back {
      margin-bottom: 8px;
    }
    /* Grid and labels come from the shared .facts rules; only the frame is local. */
    .facts {
      margin-bottom: 8px;
      max-width: 760px;
    }
    .sub {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .section-title {
      margin: 32px 0 8px;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .empty {
      padding: 16px 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminInvoiceDetailPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly columns = ['description', 'type', 'quantity', 'unitPrice', 'amount'];
  readonly detail = signal<ResellerInvoiceDetail | null>(null);
  readonly loading = signal(false);
  readonly missing = signal(false);

  ngOnInit(): void {
    void this.load(Number(this.route.snapshot.paramMap.get('id')));
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** A unit price can be a fraction of a cent, so it gets its own formatting. */
  unitPrice(value: string | number | null | undefined): string {
    return formatUnitPrice(value, this.language.current());
  }

  quantity(value: string | number | null | undefined): string {
    const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
    if (!Number.isFinite(amount)) return '';
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 2 }).format(amount);
  }

  /** The billed period, when the invoice carries one at all. */
  period(detail: ResellerInvoiceDetail): string {
    const start = detail.invoice.billingPeriodStart;
    const end = detail.invoice.billingPeriodEnd;
    if (!start || !end) return '';
    const format = new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    return `${format.format(new Date(start))} - ${format.format(new Date(end))}`;
  }

  private async load(id: number): Promise<void> {
    this.loading.set(true);
    try {
      this.detail.set(await firstValueFrom(this.hub.get<ResellerInvoiceDetail>(`/resellers/invoices/${id}`)));
    } catch (err) {
      if (readApiError(err).code === 'not_found') this.missing.set(true);
      else this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
