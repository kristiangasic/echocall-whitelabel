import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type {
  ResellerAddonPackage,
  ResellerAddonPurchase,
  ResellerAddonStats,
} from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  SellAddonDialogComponent,
  type SellAddonDialogData,
  type SellAddonResult,
} from './sell-addon-dialog.component';

/** Both kinds of package, in the order the figures read best. */
const ADDON_TYPES = ['voice_minutes', 'chat_conversations'] as const;

/** How many sales the page shows; the hub has no paging here, only a limit. */
const PURCHASE_LIMIT = 50;

/**
 * Credit packages: what is on offer, what has been sold, and the two figures
 * that say whether selling them is worth anything. A sale grants the credits
 * on the spot, so it runs through its own dialog rather than a row button.
 */
@Component({
  selector: 'app-admin-addons-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.addons.title') }}</h1>
          <p class="page-hint">{{ t('admin.addons.intro') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="sell()" data-testid="sell">
          <mat-icon>sell</mat-icon>
          {{ t('admin.addons.sell') }}
        </button>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <!--
        Four figures, always the same four: both kinds of package keep their
        tile even in a week nobody bought one, so the row never goes ragged.
      -->
      <div class="stat-grid" data-testid="stats">
        <div class="stat">
          <span class="stat-label">{{ t('admin.addons.stats.sales') }}</span>
          <span class="stat-value">{{ stats() ? stats()?.totalAddons : '–' }}</span>
          <p class="stat-foot">
            {{ stats() ? t('admin.addons.stats.salesHint') : t('admin.addons.stats.unavailable') }}
          </p>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('admin.addons.stats.revenue') }}</span>
          <span class="stat-value">{{ stats() ? money(stats()?.totalRevenue) : '–' }}</span>
          <p class="stat-foot">
            {{ stats() ? t('admin.addons.stats.revenueHint') : t('admin.addons.stats.unavailable') }}
          </p>
        </div>
        @for (type of types; track type) {
          <div class="stat">
            <span class="stat-label">{{ t('admin.addons.stats.revenueBy.' + type) }}</span>
            <span class="stat-value">{{ stats() ? money(byType(type).revenue) : '–' }}</span>
            <p class="stat-foot">
              {{ t('admin.addons.stats.sales') }}: {{ stats() ? byType(type).count : '–' }}
            </p>
          </div>
        }
      </div>

      <h2 class="section-title">{{ t('admin.addons.packages.title') }}</h2>
      <p class="page-hint">{{ t('admin.addons.packages.intro') }}</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="packages()" data-testid="packages-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.name') }}</th>
            <td mat-cell *matCellDef="let item" [attr.data-label]="t('fields.name')">
              <div>{{ item.name }}</div>
              @if (item.description) {
                <div class="cell-sub">{{ item.description }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.packages.quantity') }}</th>
            <td mat-cell *matCellDef="let item" [attr.data-label]="t('admin.addons.packages.quantity')">
              {{ t('admin.addons.units.' + item.type, { count: item.quantity }) }}
              <div class="cell-sub">{{ t('admin.addons.types.' + item.type) }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="price">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.packages.price') }}</th>
            <td
              mat-cell
              *matCellDef="let item"
              [attr.data-label]="t('admin.addons.packages.price')"
              class="numeric"
            >
              {{ money(item.totalPrice) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let item" class="row-actions">
              <button mat-stroked-button type="button" (click)="sell(item)">
                {{ t('admin.addons.sell') }}
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="packageColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: packageColumns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="packageColumns.length">
              {{ t('admin.addons.packages.empty') }}
            </td>
          </tr>
        </table>
      </div>

      <h2 class="section-title">{{ t('admin.addons.purchases.title') }}</h2>
      <p class="page-hint">{{ t('admin.addons.purchases.intro', { count: limit }) }}</p>
      <div class="table-wrap">
        <table mat-table [dataSource]="purchases()" data-testid="purchases-table">
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.purchases.customer') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.addons.purchases.customer')">
              <div>{{ customerName(row) }}</div>
              @if (row.customer?.name && row.customer?.email) {
                <div class="cell-sub">{{ row.customer.email }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="package">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.purchases.package') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.addons.purchases.package')">
              {{ packageName(row) || t('admin.addons.types.' + row.addon.addonType) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="quantity">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.purchases.quantity') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.addons.purchases.quantity')"
              class="numeric"
            >
              {{ t('admin.addons.units.' + row.addon.addonType, { count: row.addon.quantity }) }}
              @if (row.addon.usedAmount) {
                <div class="cell-sub">{{ t('admin.addons.purchases.used') }}: {{ row.addon.usedAmount }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="price">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.purchases.price') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.addons.purchases.price')"
              class="numeric"
            >
              {{ money(row.addon.totalPriceEur) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + row.addon.status">
                {{ t('admin.addons.purchases.statuses.' + row.addon.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.addons.purchases.date') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.addons.purchases.date')"
              class="nowrap"
            >
              {{ row.addon.paymentDate || row.addon.createdAt | localDate }}
              @if (row.addon.expiryDate) {
                <div class="cell-sub">
                  {{ t('admin.addons.purchases.expiry') }}: {{ row.addon.expiryDate | localDate }}
                </div>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="purchaseColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: purchaseColumns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="purchaseColumns.length">
              {{ t('admin.addons.purchases.empty') }}
            </td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
  styles: `
    .section-title {
      margin: 32px 0 4px;
    }
    .cell-sub {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .row-actions {
      text-align: right;
      white-space: nowrap;
    }
    .numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AdminAddonsPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly limit = PURCHASE_LIMIT;
  readonly types = ADDON_TYPES;
  readonly packageColumns = ['name', 'type', 'price', 'actions'];
  readonly purchaseColumns = ['customer', 'package', 'quantity', 'price', 'status', 'date'];
  readonly packages = signal<ResellerAddonPackage[]>([]);
  readonly purchases = signal<ResellerAddonPurchase[]>([]);
  readonly stats = signal<ResellerAddonStats | null>(null);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** What one kind of package earned, zero included, so its tile is always there. */
  byType(type: string): { revenue: string | number; count: number } {
    const row = this.stats()?.byType?.find((entry) => entry.type === type);
    return { revenue: row?.revenue ?? 0, count: row?.count ?? 0 };
  }

  /**
   * The name of the plan the sale was made from. The hub keeps it in the
   * purchase metadata, a JSON string; anything else there is none of our
   * business, and a sale made outside the portal carries no name at all.
   */
  packageName(row: ResellerAddonPurchase): string {
    const raw = row.addon.metadata;
    if (!raw) return '';
    try {
      const parsed: unknown = JSON.parse(raw);
      const name = (parsed as { planName?: unknown })?.planName;
      return typeof name === 'string' ? name : '';
    } catch {
      return '';
    }
  }

  /** The name of the buyer, or the address, or the identifier the sale was booked on. */
  customerName(row: ResellerAddonPurchase): string {
    return row.customer?.name || row.customer?.email || String(row.addon.customerId);
  }

  /**
   * Reads the three parts separately: the figures are the least important of
   * them, so a hub that cannot answer for them leaves the tables standing.
   */
  async load(): Promise<void> {
    this.loading.set(true);
    const [packages, purchases, stats] = await Promise.allSettled([
      firstValueFrom(this.hub.list<ResellerAddonPackage>('/resellers/addons/packages')),
      firstValueFrom(
        this.hub.list<ResellerAddonPurchase>('/resellers/addons/purchases', { limit: PURCHASE_LIMIT }),
      ),
      firstValueFrom(this.hub.get<ResellerAddonStats>('/resellers/addons/stats')),
    ]);
    this.loading.set(false);
    if (packages.status === 'fulfilled') this.packages.set(packages.value);
    if (purchases.status === 'fulfilled') this.purchases.set(purchases.value);
    this.stats.set(stats.status === 'fulfilled' ? stats.value : null);
    const failed = [packages, purchases].find((part) => part.status === 'rejected');
    if (failed) this.notify.apiError(failed.reason);
  }

  /** Opens the sale, with the package of the row it was started from when there is one. */
  sell(item?: ResellerAddonPackage): void {
    const data: SellAddonDialogData = item ? { packageId: item.id } : {};
    this.dialog
      .open<SellAddonDialogComponent, SellAddonDialogData, SellAddonResult>(SellAddonDialogComponent, {
        data,
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.notify.success('admin.addons.sold', { count: result.creditsGranted });
        void this.load();
      });
  }
}
