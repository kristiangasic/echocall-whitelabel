import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { DownloadService } from '../../core/download/download.service';
import { readApiError } from '../../core/errors/api-error';
import { formatMoney } from '../../core/format/money';
import type { Balance, Invoice, Subscription, Transaction } from '../../core/hub/hub.models';
import { HubService } from '../../core/hub/hub.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotifyService } from '../../core/notify/notify.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../shared/paginator-intl';

const TRANSACTION_COLUMNS = ['booked', 'description', 'amount', 'balance'];
const INVOICE_COLUMNS = ['number', 'issued', 'total', 'status', 'download'];

/**
 * Plan, balance, wallet movements and invoices of the linked customer.
 * Everything is read through the hub proxy; only the invoice document goes
 * through the portal's own API, which fetches it from the hub server side.
 */
@Component({
  selector: 'app-billing-panel',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="tiles">
        <mat-card appearance="outlined" data-testid="billing-plan">
          <mat-card-header>
            <mat-icon mat-card-avatar>workspace_premium</mat-icon>
            <mat-card-title>{{ t('user.billing.plan.title') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (subscription(); as s) {
              <p class="figure">{{ s.plan?.name }}</p>
              @if (s.plan?.priceEur; as price) {
                <p class="figure-label">{{ money(price) }}</p>
              }
              <p class="hint">
                {{ t('user.billing.plan.status', { status: subscriptionStatus(s.status) }) }}
              </p>
              @if (s.renewalDate; as renewal) {
                <p class="hint">
                  {{ t('user.billing.plan.renews', { date: renewal | localDate }) }}
                </p>
              }
            } @else {
              <p class="hint" data-testid="billing-no-plan">{{ t('user.billing.plan.none') }}</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" data-testid="billing-balance">
          <mat-card-header>
            <mat-icon mat-card-avatar>account_balance_wallet</mat-icon>
            <mat-card-title>{{ t('user.billing.balance.title') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (balance(); as b) {
              <p class="figure">{{ money(b.balanceEur) }}</p>
              @if (b.voiceMinutesRemaining !== null && b.voiceMinutesRemaining !== undefined) {
                <p class="hint">
                  {{ t('user.billing.balance.voice', { count: b.voiceMinutesRemaining }) }}
                </p>
              }
              @if (b.chatConversationsRemaining !== null && b.chatConversationsRemaining !== undefined) {
                <p class="hint">
                  {{ t('user.billing.balance.chat', { count: b.chatConversationsRemaining }) }}
                </p>
              }
            } @else {
              <p class="hint">{{ t('user.billing.balance.unknown') }}</p>
            }
          </mat-card-content>
        </mat-card>
      </div>

      <h2 class="section">{{ t('user.billing.invoices.title') }}</h2>
      <div class="table-wrap">
        <table mat-table [dataSource]="invoices()" data-testid="invoices-table">
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.invoices.number') }}</th>
            <td mat-cell *matCellDef="let invoice" [attr.data-label]="t('user.billing.invoices.number')">
              {{ invoice.invoiceNumber ?? invoice.id }}
            </td>
          </ng-container>
          <ng-container matColumnDef="issued">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.invoices.issued') }}</th>
            <td mat-cell *matCellDef="let invoice" [attr.data-label]="t('user.billing.invoices.issued')">
              {{ invoice.issuedDate ?? invoice.createdAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.invoices.total') }}</th>
            <td mat-cell *matCellDef="let invoice" [attr.data-label]="t('user.billing.invoices.total')">
              {{ money(invoice.totalEur) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.invoices.status') }}</th>
            <td mat-cell *matCellDef="let invoice" [attr.data-label]="t('user.billing.invoices.status')">
              {{ invoiceStatus(invoice.status) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="download">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let invoice" class="cell-actions">
              <button
                mat-icon-button
                type="button"
                (click)="download(invoice)"
                [disabled]="downloading() !== null"
                [attr.aria-label]="t('user.billing.invoices.download')"
                [attr.data-testid]="'invoice-download-' + invoice.id"
              >
                <mat-icon>download</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="invoiceColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: invoiceColumns"></tr>
        </table>
      </div>
      @if (invoices().length === 0 && !loading()) {
        <p class="empty">{{ t('user.billing.invoices.empty') }}</p>
      }

      <h2 class="section">{{ t('user.billing.transactions.title') }}</h2>
      <div class="table-wrap">
        <table mat-table [dataSource]="transactions()" data-testid="transactions-table">
          <ng-container matColumnDef="booked">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.transactions.booked') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.billing.transactions.booked')">
              {{ row.createdAt | localDate: 'short' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.transactions.description') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.billing.transactions.description')">
              {{ row.description || transactionType(row.type) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.transactions.amount') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('user.billing.transactions.amount')"
              [class.negative]="row.amount < 0"
            >
              {{ money(row.amount) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="balance">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.billing.transactions.balance') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.billing.transactions.balance')">
              {{ money(row.balanceAfter) }}
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="transactionColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: transactionColumns"></tr>
        </table>
      </div>
      @if (transactions().length === 0 && !loading()) {
        <p class="empty">{{ t('user.billing.transactions.empty') }}</p>
      }
      <mat-paginator
        [length]="transactionTotal()"
        [pageSize]="perPage()"
        [pageIndex]="page() - 1"
        [pageSizeOptions]="[20, 50]"
        (page)="changePage($event)"
      />
    </ng-container>
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      align-items: start;
    }
    .figure {
      font: var(--mat-sys-headline-small);
      margin: 0;
    }
    .figure-label {
      margin: 4px 0 0;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0;
    }
    .section {
      font: var(--mat-sys-title-medium);
      margin: 32px 0 12px;
    }
    table {
      width: 100%;
    }
    .negative {
      color: var(--mat-sys-error);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      padding: 16px 0;
    }
  `,
})
export class BillingPanel implements OnInit {
  private readonly api = inject(ApiService);
  private readonly hub = inject(HubService);
  private readonly downloads = inject(DownloadService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  readonly invoiceColumns = INVOICE_COLUMNS;
  readonly transactionColumns = TRANSACTION_COLUMNS;

  readonly balance = signal<Balance | null>(null);
  readonly subscription = signal<Subscription | null>(null);
  readonly invoices = signal<Invoice[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly transactionTotal = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly loading = signal(false);
  readonly downloading = signal<number | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  money(value: number | string | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** Hub states are open-ended; an unknown one is shown as it came rather than hidden. */
  subscriptionStatus(status: string | undefined): string {
    return this.translate('user.billing.subscriptionStatuses.', status);
  }

  invoiceStatus(status: string | undefined): string {
    return this.translate('user.billing.invoiceStatuses.', status);
  }

  transactionType(type: string | null | undefined): string {
    return this.translate('user.billing.transactionTypes.', type);
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.loadTransactions();
  }

  async download(invoice: Invoice): Promise<void> {
    this.downloading.set(invoice.id);
    try {
      const file = await firstValueFrom(this.api.blob(`/account/invoices/${invoice.id}/pdf`));
      this.downloads.save(file, `${invoice.invoiceNumber ?? `invoice-${invoice.id}`}.pdf`);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.downloading.set(null);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadBalance(),
        this.loadSubscription(),
        this.loadInvoices(),
        this.loadTransactions(),
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadBalance(): Promise<void> {
    try {
      this.balance.set(await firstValueFrom(this.hub.get<Balance>('/billing/balance')));
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /** An account on no plan answers 404, which is an answer rather than a failure. */
  private async loadSubscription(): Promise<void> {
    try {
      this.subscription.set(await firstValueFrom(this.hub.get<Subscription>('/billing/subscription')));
    } catch (err) {
      this.subscription.set(null);
      if (readApiError(err).status !== 404) this.notify.apiError(err);
    }
  }

  /** The hub answers this one with a bare array, not a { data } envelope. */
  private async loadInvoices(): Promise<void> {
    try {
      this.invoices.set(await firstValueFrom(this.hub.get<Invoice[]>('/billing/invoices')));
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private async loadTransactions(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.page<Transaction>('/billing/transactions', {
          page: this.page(),
          perPage: this.perPage(),
        }),
      );
      this.transactions.set(result.data);
      this.transactionTotal.set(result.pagination?.total ?? result.data.length);
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private translate(prefix: string, value: string | null | undefined): string {
    if (!value) return '';
    const key = prefix + value;
    const label = this.transloco.translate(key);
    return label === key ? value : label;
  }
}
