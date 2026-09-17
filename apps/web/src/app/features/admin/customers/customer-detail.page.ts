import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type {
  ResellerCustomerBalance,
  ResellerCustomerDetail,
  ResellerCustomerSubscription,
  ResellerCustomerTransaction,
  ResellerCustomerUsage,
} from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { readApiError } from '../../../core/errors/api-error';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import {
  BalanceDialogComponent,
  type BalanceDialogData,
  type BalanceDialogResult,
} from './balance-dialog.component';

const DEFAULT_PER_PAGE = 25;

/** The two kinds of consumption the service meters; anything else is shown as it comes. */
const KNOWN_USAGE_TYPES = new Set(['voice_minute', 'chat_session']);

/**
 * One customer, seen from the operator's side: who they are, what their wallet
 * holds, what they consumed, what they subscribe to and every movement on the
 * wallet. The wallet is the part an operator acts on, so it sits at the top.
 */
@Component({
  selector: 'app-admin-customer-detail-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <a mat-button routerLink="/admin/customers" class="back">
        <mat-icon>arrow_back</mat-icon>
        {{ t('admin.customers.title') }}
      </a>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (missing()) {
        <p role="alert" data-testid="missing">{{ t('admin.customer.missing') }}</p>
      }
      @if (customer(); as c) {
        <div class="page-head">
          <div>
            <h1 class="page-title">{{ c.user?.email }}</h1>
            <p class="page-hint">{{ subtitle() }}</p>
          </div>
          <div class="head-actions">
            @if (c.user?.accountStatus; as status) {
              <span class="status" [class]="'status status-' + status">
                {{ t('admin.customers.accountStatuses.' + status) }}
              </span>
            }
            <button mat-stroked-button type="button" (click)="openAsCustomer()" data-testid="open-as">
              <mat-icon>visibility</mat-icon>
              {{ t('admin.customer.openAs') }}
            </button>
          </div>
        </div>

        <div class="cards">
          <mat-card appearance="outlined" data-testid="balance-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>account_balance_wallet</mat-icon>
              <mat-card-title>{{ t('admin.customer.balance.title') }}</mat-card-title>
              <mat-card-subtitle>{{ t('admin.customer.balance.hint') }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="amount" data-testid="balance">{{ money(balance()) }}</p>
              @if (balanceError(); as message) {
                <p role="alert" class="balance-error" data-testid="balance-error">{{ message }}</p>
              }
            </mat-card-content>
            <mat-card-actions>
              <button mat-flat-button type="button" (click)="move('add')" data-testid="add">
                <mat-icon>add</mat-icon>
                {{ t('admin.customer.balance.add') }}
              </button>
              <button mat-stroked-button type="button" (click)="move('subtract')" data-testid="subtract">
                <mat-icon>remove</mat-icon>
                {{ t('admin.customer.balance.subtract') }}
              </button>
            </mat-card-actions>
          </mat-card>

          <mat-card appearance="outlined" data-testid="usage-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>insights</mat-icon>
              <mat-card-title>{{ t('admin.customer.usage.title') }}</mat-card-title>
              @if (usage(); as u) {
                <mat-card-subtitle>
                  {{
                    t('admin.customer.usage.period', {
                      from: fromDate(u.period.from),
                      to: fromDate(u.period.to),
                    })
                  }}
                </mat-card-subtitle>
              }
            </mat-card-header>
            <mat-card-content>
              @if (usageRows().length) {
                <dl class="usage">
                  @for (row of usageRows(); track row.usageType) {
                    <div>
                      <dt>{{ usageLabel(row.usageType, t) }}</dt>
                      <dd>
                        {{ quantity(row.totalQuantity) }}
                        <span class="revenue">{{ money(row.totalRevenue ?? null) }}</span>
                      </dd>
                    </div>
                  }
                </dl>
              } @else {
                <p class="empty" data-testid="usage-empty">{{ t('admin.customer.usage.empty') }}</p>
              }
            </mat-card-content>
          </mat-card>
        </div>

        <h2 class="section">{{ t('admin.customer.subscriptions.title') }}</h2>
        @if (subscriptions().length) {
          <div class="table-wrap">
            <table mat-table [dataSource]="subscriptions()" data-testid="subscriptions-table">
              <ng-container matColumnDef="plan">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.plan') }}</th>
                <td mat-cell *matCellDef="let row">
                  {{ row.plan?.name ?? t('admin.customer.subscriptions.planGone') }}
                </td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
                <td mat-cell *matCellDef="let row">
                  <span class="status" [class]="'status status-' + row.subscription.status">
                    {{ t('admin.customer.subscriptions.statuses.' + row.subscription.status) }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="price">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.price') }}</th>
                <td mat-cell *matCellDef="let row" class="numeric">
                  {{ money(row.plan?.priceEur ?? null) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="start">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.start') }}</th>
                <td mat-cell *matCellDef="let row" class="nowrap">
                  {{ row.subscription.startDate | localDate }}
                </td>
              </ng-container>
              <ng-container matColumnDef="end">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.end') }}</th>
                <td mat-cell *matCellDef="let row" class="nowrap">
                  {{ row.subscription.endDate | localDate }}
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="subscriptionColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: subscriptionColumns"></tr>
            </table>
          </div>
        } @else {
          <p class="empty" data-testid="subscriptions-empty">
            {{ t('admin.customer.subscriptions.empty') }}
          </p>
        }

        <h2 class="section">{{ t('admin.customer.transactions.title') }}</h2>
        <div class="table-wrap">
          <table mat-table [dataSource]="transactions()" data-testid="transactions-table">
            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.when') }}</th>
              <td mat-cell *matCellDef="let row" class="nowrap">{{ row.createdAt | localDate }}</td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.type') }}</th>
              <td mat-cell *matCellDef="let row">
                {{ t('admin.customer.transactions.types.' + row.type) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.reason') }}</th>
              <td mat-cell *matCellDef="let row">{{ row.description }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.amount') }}</th>
              <td mat-cell *matCellDef="let row" class="numeric">{{ money(row.amount) }}</td>
            </ng-container>
            <ng-container matColumnDef="balanceAfter">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.after') }}</th>
              <td mat-cell *matCellDef="let row" class="numeric">{{ money(row.balanceAfter) }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="transactionColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: transactionColumns"></tr>
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell empty" [attr.colspan]="transactionColumns.length">
                {{ t('admin.customer.transactions.empty') }}
              </td>
            </tr>
          </table>
        </div>
        <mat-paginator
          [length]="transactionTotal()"
          [pageIndex]="page() - 1"
          [pageSize]="perPage()"
          [pageSizeOptions]="[25, 50, 100]"
          (page)="onPage($event)"
        />
      }
    </ng-container>
  `,
  styles: `
    .back {
      margin-bottom: 8px;
    }
    .head-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .amount {
      font: var(--mat-sys-headline-medium);
      font-variant-numeric: tabular-nums;
      margin: 0;
    }
    .balance-error {
      color: var(--mat-sys-error);
      margin: 8px 0 0;
    }
    .usage {
      margin: 0;
      display: grid;
      gap: 8px;
    }
    .usage div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .usage dt,
    .usage dd {
      margin: 0;
    }
    .usage dd {
      font-variant-numeric: tabular-nums;
    }
    .revenue {
      color: var(--mat-sys-on-surface-variant);
      margin-left: 8px;
    }
    .section {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 8px;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .nowrap {
      white-space: nowrap;
    }
    .empty {
      padding: 16px 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminCustomerDetailPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  /** The customer id of the service, taken from the route. */
  readonly id = signal(0);

  readonly subscriptionColumns = ['plan', 'status', 'price', 'start', 'end'];
  readonly transactionColumns = ['createdAt', 'type', 'description', 'amount', 'balanceAfter'];

  readonly customer = signal<ResellerCustomerDetail | null>(null);
  readonly balance = signal<number | null>(null);
  readonly usage = signal<ResellerCustomerUsage | null>(null);
  readonly subscriptions = signal<ResellerCustomerSubscription[]>([]);
  readonly transactions = signal<ResellerCustomerTransaction[]>([]);
  readonly transactionTotal = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(DEFAULT_PER_PAGE);
  readonly loading = signal(false);
  readonly missing = signal(false);
  /** What the service said about the last wallet movement it refused. */
  readonly balanceError = signal<string | null>(null);

  ngOnInit(): void {
    this.id.set(Number(this.route.snapshot.paramMap.get('id')));
    void this.load();
  }

  /** The name and the company of the customer, whichever of them is on file. */
  subtitle(): string {
    const user = this.customer()?.user;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    return [name, user?.company].filter(Boolean).join(' - ');
  }

  money(value: number | string | null): string {
    return formatMoney(value, this.language.current());
  }

  quantity(value: number | undefined): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 2 }).format(value ?? 0);
  }

  fromDate(value: string): string {
    return new Date(value).toLocaleDateString(this.language.current());
  }

  usageRows() {
    return this.usage()?.usage ?? [];
  }

  /** Names the metered types the portal knows; anything new is shown as the service calls it. */
  usageLabel(type: string, t: (key: string) => string): string {
    return KNOWN_USAGE_TYPES.has(type) ? t('admin.customer.usage.types.' + type) : type;
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.loadTransactions();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.missing.set(false);
    try {
      const customerId = this.id();
      const [customer, balance, usage, subscriptions] = await Promise.all([
        firstValueFrom(this.hub.get<ResellerCustomerDetail>(`/resellers/customers/${customerId}`)),
        firstValueFrom(this.hub.get<ResellerCustomerBalance>(`/resellers/customers/${customerId}/balance`)),
        firstValueFrom(this.hub.get<ResellerCustomerUsage>(`/resellers/customers/${customerId}/usage`)),
        firstValueFrom(
          this.hub.get<{ data: ResellerCustomerSubscription[] }>(
            `/resellers/customers/${customerId}/subscriptions`,
          ),
        ),
      ]);
      this.customer.set(customer);
      this.balance.set(balance.balance);
      this.usage.set(usage);
      this.subscriptions.set(subscriptions.data ?? []);
    } catch (err) {
      if (readApiError(err).status === 404) this.missing.set(true);
      else this.notify.apiError(err);
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    await this.loadTransactions();
  }

  async loadTransactions(): Promise<void> {
    try {
      const answer = await firstValueFrom(
        this.hub.page<ResellerCustomerTransaction>(`/resellers/customers/${this.id()}/transactions`, {
          page: this.page(),
          perPage: this.perPage(),
        }),
      );
      this.transactions.set(answer.data);
      this.transactionTotal.set(answer.pagination?.total ?? answer.data.length);
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private async refreshBalance(): Promise<void> {
    try {
      const answer = await firstValueFrom(
        this.hub.get<ResellerCustomerBalance>(`/resellers/customers/${this.id()}/balance`),
      );
      this.balance.set(answer.balance);
    } catch {
      // The view keeps the balance it has; the refusal is the message that matters.
    }
  }

  /**
   * Opens the portal as this customer. The session is handed over, so the
   * operator lands in the customer's own workspace and finds the way back in
   * the banner the shell then shows.
   */
  async openAsCustomer(): Promise<void> {
    try {
      await this.auth.impersonate(this.id());
      await this.router.navigateByUrl('/app');
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /** Books money onto the wallet or off it, once an amount and a reason are given. */
  move(mode: 'add' | 'subtract'): void {
    const customer = this.customer();
    if (!customer) return;
    const data: BalanceDialogData = {
      mode,
      email: customer.user?.email ?? '',
      balance: this.money(this.balance()),
    };
    this.dialog
      .open<BalanceDialogComponent, BalanceDialogData, BalanceDialogResult>(BalanceDialogComponent, { data })
      .afterClosed()
      .subscribe(async (result) => {
        if (!result) return;
        await this.book(mode, result);
      });
  }

  private async book(mode: 'add' | 'subtract', input: BalanceDialogResult): Promise<void> {
    this.balanceError.set(null);
    try {
      const answer = await firstValueFrom(
        this.hub.post<{ newBalance: number }>(`/resellers/customers/${this.id()}/balance/${mode}`, {
          amount: input.amount,
          description: input.description,
        }),
      );
      this.balance.set(answer.newBalance);
      this.notify.success('admin.customer.balance.booked');
      await this.loadTransactions();
    } catch (err) {
      const error = readApiError(err);
      // The refusal an operator actually runs into is a deduction larger than
      // the wallet. The service says so in English, so the message is written
      // here instead, in the reader's language and with the balance the wallet
      // really holds, read back rather than taken from the stale view.
      if (error.code === 'insufficient_balance') {
        await this.refreshBalance();
        this.balanceError.set(
          this.transloco.translate('admin.customer.balance.insufficient', {
            balance: this.money(this.balance()),
          }),
        );
        return;
      }
      this.notify.apiError(err);
    }
  }
}
