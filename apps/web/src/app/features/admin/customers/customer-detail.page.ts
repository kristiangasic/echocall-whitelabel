import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
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
import type { AdminUser, UserStatus } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import {
  BalanceDialogComponent,
  type BalanceDialogData,
  type BalanceDialogResult,
} from './balance-dialog.component';
import { PortalLoginService } from './portal-login.service';

const DEFAULT_PER_PAGE = 25;

/** How far the customer list is walked when one customer has to be found in it. */
const LIST_PER_PAGE = 100;
const LIST_PAGES = 20;

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
    MatTooltipModule,
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
            @if (loginKnown()) {
              @if (login(); as l) {
                <button
                  mat-stroked-button
                  type="button"
                  disabledInteractive
                  [disabled]="l.status !== 'active'"
                  [matTooltip]="l.status === 'active' ? '' : t(blockedHint(l.status))"
                  (click)="openAsCustomer()"
                  data-testid="open-as"
                >
                  <mat-icon>visibility</mat-icon>
                  {{ t('admin.customer.openAs') }}
                </button>
              } @else {
                <button
                  mat-stroked-button
                  type="button"
                  [matTooltip]="t('admin.customers.noLoginHint')"
                  (click)="inviteLogin()"
                  data-testid="invite-login"
                >
                  <mat-icon>mail</mat-icon>
                  {{ t('admin.customers.inviteLogin') }}
                </button>
              }
            }
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

        <h2 class="section-title">{{ t('admin.customer.subscriptions.title') }}</h2>
        @if (subscriptions().length) {
          <div class="table-wrap">
            <table mat-table [dataSource]="subscriptions()" data-testid="subscriptions-table">
              <ng-container matColumnDef="plan">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.plan') }}</th>
                <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.customer.subscriptions.plan')">
                  {{ row.plan?.name ?? t('admin.customer.subscriptions.planGone') }}
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
              <ng-container matColumnDef="price">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.price') }}</th>
                <td
                  mat-cell
                  *matCellDef="let row"
                  [attr.data-label]="t('admin.customer.subscriptions.price')"
                  class="numeric"
                >
                  {{ money(row.plan?.priceEur ?? null) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="start">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.start') }}</th>
                <td
                  mat-cell
                  *matCellDef="let row"
                  [attr.data-label]="t('admin.customer.subscriptions.start')"
                  class="nowrap"
                >
                  {{ row.subscription.startDate | localDate }}
                </td>
              </ng-container>
              <ng-container matColumnDef="end">
                <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.subscriptions.end') }}</th>
                <td
                  mat-cell
                  *matCellDef="let row"
                  [attr.data-label]="t('admin.customer.subscriptions.end')"
                  class="nowrap"
                >
                  {{ row.subscription.endDate | localDate }}
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="subscriptionColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: subscriptionColumns"></tr>
            </table>
          </div>
        } @else {
          <p class="empty empty-panel" data-testid="subscriptions-empty">
            {{ t('admin.customer.subscriptions.empty') }}
          </p>
        }

        <h2 class="section-title">{{ t('admin.customer.transactions.title') }}</h2>
        <div class="table-wrap">
          <table mat-table [dataSource]="transactions()" data-testid="transactions-table">
            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.when') }}</th>
              <td
                mat-cell
                *matCellDef="let row"
                [attr.data-label]="t('admin.customer.transactions.when')"
                class="nowrap"
              >
                {{ row.createdAt | localDate }}
              </td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.type') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.customer.transactions.type')">
                {{ t('admin.customer.transactions.types.' + row.type) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.reason') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.customer.transactions.reason')">
                {{ row.description }}
              </td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.amount') }}</th>
              <td
                mat-cell
                *matCellDef="let row"
                [attr.data-label]="t('admin.customer.transactions.amount')"
                class="numeric"
              >
                {{ money(row.amount) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="balanceAfter">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.customer.transactions.after') }}</th>
              <td
                mat-cell
                *matCellDef="let row"
                [attr.data-label]="t('admin.customer.transactions.after')"
                class="numeric"
              >
                {{ money(row.balanceAfter) }}
              </td>
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
        @if (transactionTotal() > perPage()) {
          <mat-paginator
            [length]="transactionTotal()"
            [pageIndex]="page() - 1"
            [pageSize]="perPage()"
            [pageSizeOptions]="[25, 50, 100]"
            (page)="onPage($event)"
          />
        }
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
    /* Two cards, so two columns: wallet on the left, what it paid for on the right. */
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
      gap: 16px;
      margin-bottom: 8px;
      max-width: 1040px;
    }
    @media (max-width: 899px) {
      .cards {
        grid-template-columns: minmax(0, 1fr);
      }
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
    .section-title {
      margin: 32px 0 8px;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    /* Inside the usage card the sentence is the card's content and needs no
       frame of its own, unlike the one that stands for a whole section. */
    mat-card .empty {
      padding: 16px 0;
    }
  `,
})
export class AdminCustomerDetailPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly logins = inject(PortalLoginService);

  /** The customer id of the service, taken from the route. */
  readonly id = signal(0);

  readonly subscriptionColumns = ['plan', 'status', 'price', 'start', 'end'];
  readonly transactionColumns = ['createdAt', 'type', 'description', 'amount', 'balanceAfter'];

  readonly customer = signal<ResellerCustomerDetail | null>(null);
  /** The portal login of this customer, and whether the portal has been asked yet. */
  readonly login = signal<AdminUser | null>(null);
  readonly loginKnown = signal(false);
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

  /** A day of the billing period, in the same spelling as every other date here. */
  fromDate(value: string): string {
    return new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(value));
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
    const customerId = this.id();

    let customer: ResellerCustomerDetail | null;
    try {
      customer = await firstValueFrom(
        this.hub.get<ResellerCustomerDetail>(`/resellers/customers/${customerId}`),
      );
    } catch (err) {
      const error = readApiError(err);
      // A service release that does not answer the single-customer route at
      // all reads as 404 here, exactly like a customer who is not ours. The
      // list knows both apart: it holds every customer this portal may see.
      if (error.status === 404) customer = await this.findInList(customerId);
      else {
        this.notify.apiError(err);
        this.loading.set(false);
        return;
      }
    }

    if (!customer) {
      this.missing.set(true);
      this.loading.set(false);
      return;
    }
    this.customer.set(customer);

    // The wallet, the consumption, the subscriptions and the portal login are
    // four separate questions: one that cannot be answered leaves the rest
    // standing. Only the login comes from this portal; the other three are the
    // service's to answer.
    const [balance, usage, subscriptions, login] = await Promise.allSettled([
      firstValueFrom(this.hub.get<ResellerCustomerBalance>(`/resellers/customers/${customerId}/balance`)),
      firstValueFrom(this.hub.get<ResellerCustomerUsage>(`/resellers/customers/${customerId}/usage`)),
      firstValueFrom(
        this.hub.get<{ data: ResellerCustomerSubscription[] }>(
          `/resellers/customers/${customerId}/subscriptions`,
        ),
      ),
      this.logins.find(customerId),
    ]);
    if (balance.status === 'fulfilled') this.balance.set(balance.value.balance);
    if (usage.status === 'fulfilled') this.usage.set(usage.value);
    if (subscriptions.status === 'fulfilled') this.subscriptions.set(subscriptions.value.data ?? []);
    if (login.status === 'fulfilled') {
      this.login.set(login.value);
      this.loginKnown.set(true);
    }

    this.loading.set(false);
    await this.loadTransactions();
  }

  /** Walks the customer list for one customer, newest link first. */
  private async findInList(customerId: number): Promise<ResellerCustomerDetail | null> {
    for (let page = 1; page <= LIST_PAGES; page++) {
      const answer = await firstValueFrom(
        this.hub.page<ResellerCustomerDetail>('/resellers/customers', { page, perPage: LIST_PER_PAGE }),
      );
      const row = answer.data.find((entry) => entry.userId === customerId);
      if (row) return row;
      if (answer.data.length < LIST_PER_PAGE) return null;
    }
    return null;
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
    // The button stays readable while it is shut, so it can still be clicked;
    // the tooltip on it has already said why nothing happens.
    if (this.login()?.status !== 'active') return;
    await this.logins.open(this.id());
  }

  /** Why the portal cannot be opened as this customer while the login stands as it does. */
  blockedHint(status: UserStatus): string {
    return status === 'disabled' ? 'errors.account_disabled' : 'errors.login_not_active';
  }

  /** Sends a customer of the service their way into this portal. */
  async inviteLogin(): Promise<void> {
    const user = this.customer()?.user;
    if (!user?.email) return;
    const login = await this.logins.invite({
      customerId: this.id(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    if (login) this.login.set(login);
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
