import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCustomer } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import type { AdminUser } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { NO_VALUE } from '../../../shared/no-value';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import {
  CustomerDialogComponent,
  type CustomerDialogData,
  type CustomerDialogResult,
} from './customer-dialog.component';
import { type CustomerRow, mergeCustomers } from './customer-row';
import { PortalLoginService } from './portal-login.service';

const DEFAULT_PER_PAGE = 25;

/**
 * The operator's customer book. The customers come from the service, the logins
 * from the portal, and the two are shown as one row, because an operator thinks
 * of them as one customer.
 */
@Component({
  selector: 'app-admin-customers-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
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
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.customers.title') }}</h1>
          <p class="page-hint">{{ t('admin.customers.hint') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="create()" data-testid="create">
          <mat-icon>person_add</mat-icon>
          {{ t('admin.customers.create') }}
        </button>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()" data-testid="customers-table">
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.email') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.email')">
              <a [routerLink]="[row.customerId]" data-testid="open">{{ row.email }}</a>
              @if (subtitle(row); as sub) {
                <div class="cell-sub">{{ sub }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="account">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.customers.account') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.customers.account')">
              @if (row.accountStatus) {
                <span class="status" [class]="'status status-' + row.accountStatus">
                  {{ t('admin.customers.accountStatuses.' + row.accountStatus) }}
                </span>
              } @else {
                <span class="empty">{{ noValue }}</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="login">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.customers.login') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.customers.login')">
              @if (row.login) {
                <span class="status" [class]="'status status-' + row.login.status">
                  {{ t('statuses.' + row.login.status) }}
                </span>
              } @else {
                <span
                  class="status status-none"
                  data-testid="no-login"
                  [matTooltip]="t('admin.customers.noLoginHint')"
                >
                  {{ t('admin.customers.noLogin') }}
                </span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="balance">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.customers.balance') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.customers.balance')"
              class="numeric"
            >
              {{ money(row.balanceEur) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="createdAt">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.customers.created') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.customers.created')"
              class="nowrap"
            >
              {{ row.createdAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="cell-actions">
              <button
                mat-icon-button
                type="button"
                [matMenuTriggerFor]="menu"
                [matMenuTriggerData]="{ row: row }"
                [attr.aria-label]="t('actions.more')"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('admin.customers.empty') }}
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
          @if (row.login?.status === 'active') {
            <button mat-menu-item type="button" (click)="openAs(row)" data-testid="open-as">
              <mat-icon>visibility</mat-icon>
              <span>{{ t('admin.customer.openAs') }}</span>
            </button>
          }
          <button mat-menu-item type="button" (click)="edit(row)">
            <mat-icon>edit</mat-icon>
            <span>{{ t('actions.edit') }}</span>
          </button>
          @if (!row.login) {
            <button mat-menu-item type="button" (click)="inviteLogin(row)">
              <mat-icon>mail</mat-icon>
              <span>{{ t('admin.customers.inviteLogin') }}</span>
            </button>
          }
          @if (row.accountStatus === 'suspended') {
            <button mat-menu-item type="button" (click)="setSuspended(row, false)">
              <mat-icon>lock_open</mat-icon>
              <span>{{ t('admin.customers.unsuspend') }}</span>
            </button>
          } @else {
            <button mat-menu-item type="button" (click)="setSuspended(row, true)">
              <mat-icon>lock</mat-icon>
              <span>{{ t('admin.customers.suspend') }}</span>
            </button>
          }
          <button mat-menu-item type="button" (click)="remove(row)">
            <mat-icon>delete</mat-icon>
            <span>{{ t('actions.delete') }}</span>
          </button>
        </ng-template>
      </mat-menu>
    </ng-container>
  `,
  styles: `
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
    .nowrap {
      white-space: nowrap;
    }
    .status-none {
      color: var(--mat-sys-on-surface-variant);
    }
    .empty {
      padding: 24px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminCustomersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly logins = inject(PortalLoginService);
  private readonly language = inject(LanguageService);

  /** What a cell shows where there is nothing to put in it. */
  readonly noValue = NO_VALUE;
  readonly columns = ['customer', 'account', 'login', 'balance', 'createdAt', 'actions'];
  readonly rows = signal<CustomerRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(DEFAULT_PER_PAGE);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  /** The name and the company below the address, whichever of them the customer has. */
  subtitle(row: CustomerRow): string {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    return [name, row.company].filter(Boolean).join(' - ');
  }

  money(value: string | null): string {
    return formatMoney(value, this.language.current());
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [customers, logins] = await Promise.all([
        firstValueFrom(
          this.hub.page<ResellerCustomer>('/resellers/customers', {
            page: this.page(),
            perPage: this.perPage(),
          }),
        ),
        firstValueFrom(this.api.get<{ data: AdminUser[] }>('/admin/users')),
      ]);
      this.rows.set(mergeCustomers(customers.data, logins.data));
      this.total.set(customers.pagination?.total ?? customers.data.length);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  create(): void {
    const data: CustomerDialogData = {
      mode: 'create',
      defaultLanguage: this.logins.defaultLanguage(),
    };
    this.open(data, (result) => {
      if (result.mode !== 'create') return;
      this.logins.announce(result.result);
    });
  }

  edit(row: CustomerRow): void {
    this.open({ mode: 'edit', customer: row }, () => this.notify.success('admin.customers.saved'));
  }

  /** Opens the portal as this customer, for support work in their account. */
  async openAs(row: CustomerRow): Promise<void> {
    await this.logins.open(row.customerId);
  }

  /** Invites a portal login for a customer that only exists in the service. */
  async inviteLogin(row: CustomerRow): Promise<void> {
    const login = await this.logins.invite(row);
    if (login) await this.load();
  }

  setSuspended(row: CustomerRow, suspend: boolean): void {
    const data: ConfirmDialogData = {
      titleKey: suspend ? 'admin.customers.suspendTitle' : 'admin.customers.unsuspendTitle',
      messageKey: suspend ? 'admin.customers.suspendMessage' : 'admin.customers.unsuspendMessage',
      params: { email: row.email },
      confirmKey: suspend ? 'admin.customers.suspend' : 'admin.customers.unsuspend',
      destructive: suspend,
    };
    this.confirm(data, async () => {
      const path = suspend ? 'suspend' : 'unsuspend';
      await firstValueFrom(this.api.post(`/admin/customers/${row.customerId}/${path}`));
      this.notify.success('admin.customers.saved');
    });
  }

  remove(row: CustomerRow): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.customers.deleteTitle',
      messageKey: 'admin.customers.deleteMessage',
      params: { email: row.email },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    this.confirm(data, async () => {
      await firstValueFrom(this.api.delete(`/admin/customers/${row.customerId}`));
      this.notify.success('admin.customers.deleted');
    });
  }

  private open(data: CustomerDialogData, done: (result: CustomerDialogResult) => void): void {
    this.dialog
      .open<CustomerDialogComponent, CustomerDialogData, CustomerDialogResult>(CustomerDialogComponent, {
        data,
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        void this.load();
        done(result);
      });
  }

  private confirm(data: ConfirmDialogData, run: () => Promise<void>): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await run();
        } catch (err) {
          this.notify.apiError(err);
          return;
        }
        void this.load();
      });
  }
}
