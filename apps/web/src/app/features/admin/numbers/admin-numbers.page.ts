import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { PhoneNumber, ResellerAssignedNumber } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  AssignNumberDialogComponent,
  type AssignNumberDialogData,
  type AssignNumberResult,
} from './assign-number-dialog.component';
import { ImportNumberDialogComponent, type ImportNumberResult } from './import-number-dialog.component';

/**
 * The number pool of the portal, in the two states a number can be in: lying in
 * the pool, or held by a customer. Both lists are shown at once rather than
 * behind tabs, because handing a number out moves a row from one to the other
 * and the operator should see that happen.
 */
@Component({
  selector: 'app-admin-numbers-page',
  imports: [
    MatButtonModule,
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
          <h1 class="page-title">{{ t('admin.numbers.title') }}</h1>
          <p class="page-hint">{{ t('admin.numbers.intro') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="importNumber()" data-testid="import">
          <mat-icon>add</mat-icon>
          {{ t('admin.numbers.import') }}
        </button>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <h2 class="section">{{ t('admin.numbers.tabs.available') }}</h2>
      @if (available().length) {
        <div class="table-wrap">
          <table mat-table [dataSource]="available()" data-testid="available-table">
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.number') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.number')" class="nowrap">
                {{ row.phoneNumber }}
              </td>
            </ng-container>
            <ng-container matColumnDef="label">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.label') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.label')">
                {{ row.friendlyName }}
              </td>
            </ng-container>
            <ng-container matColumnDef="country">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.country') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.country')">
                {{ row.country }}
              </td>
            </ng-container>
            <ng-container matColumnDef="direction">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.direction') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.direction')">
                {{ directions(row, t) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="price">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.price') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.price')" class="numeric">
                {{ money(row.monthlyPrice) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let row" class="row-actions">
                <button mat-stroked-button type="button" (click)="assign(row)" data-testid="assign">
                  {{ t('admin.numbers.assign') }}
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="availableColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: availableColumns"></tr>
          </table>
        </div>
      } @else {
        <p class="empty empty-panel" data-testid="available-empty">{{ t('admin.numbers.empty') }}</p>
      }

      <h2 class="section">{{ t('admin.numbers.tabs.assigned') }}</h2>
      @if (assigned().length) {
        <div class="table-wrap">
          <table mat-table [dataSource]="assigned()" data-testid="assigned-table">
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.number') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.number')" class="nowrap">
                {{ row.phoneNumber.phoneNumber }}
              </td>
            </ng-container>
            <ng-container matColumnDef="label">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.label') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.label')">
                {{ row.phoneNumber.friendlyName }}
              </td>
            </ng-container>
            <ng-container matColumnDef="customer">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.customer') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.customer')">
                @if (row.owner) {
                  {{ row.owner.name || row.owner.email }}
                } @else {
                  <span class="cell-sub">{{ t('admin.numbers.customerGone') }}</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="since">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.since') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.since')" class="nowrap">
                {{ row.phoneNumber.purchasedAt | localDate: 'date' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="price">
              <th mat-header-cell *matHeaderCellDef>{{ t('admin.numbers.price') }}</th>
              <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.numbers.price')" class="numeric">
                {{ money(row.phoneNumber.monthlyPrice) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let row" class="row-actions">
                <button mat-stroked-button type="button" (click)="release(row)" data-testid="release">
                  {{ t('admin.numbers.release') }}
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="assignedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: assignedColumns"></tr>
          </table>
        </div>
      } @else {
        <p class="empty empty-panel" data-testid="assigned-empty">
          {{ t('admin.numbers.emptyAssigned') }}
        </p>
      }
    </ng-container>
  `,
  styles: `
    .section {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 8px;
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
export class AdminNumbersPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly availableColumns = ['number', 'label', 'country', 'direction', 'price', 'actions'];
  readonly assignedColumns = ['number', 'label', 'customer', 'since', 'price', 'actions'];
  readonly available = signal<PhoneNumber[]>([]);
  readonly assigned = signal<ResellerAssignedNumber[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** What the number is cleared for; a number that can do neither says nothing. */
  directions(number: PhoneNumber, t: (key: string) => string): string {
    const parts: string[] = [];
    if (number.supportsInbound) parts.push(t('admin.numbers.inbound'));
    if (number.supportsOutbound) parts.push(t('admin.numbers.outbound'));
    return parts.join(', ');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const [available, assigned] = await Promise.allSettled([
      firstValueFrom(this.hub.list<PhoneNumber>('/resellers/phone-numbers/available')),
      firstValueFrom(this.hub.list<ResellerAssignedNumber>('/resellers/phone-numbers/assigned')),
    ]);
    this.loading.set(false);
    if (available.status === 'fulfilled') this.available.set(available.value);
    if (assigned.status === 'fulfilled') this.assigned.set(assigned.value);
    const failed = [available, assigned].find((part) => part.status === 'rejected');
    if (failed) this.notify.apiError(failed.reason);
  }

  /** Hands one number out. The customer can point an agent at it afterwards. */
  assign(number: PhoneNumber): void {
    const data: AssignNumberDialogData = { phoneNumber: number.phoneNumber };
    this.dialog
      .open<AssignNumberDialogComponent, AssignNumberDialogData, AssignNumberResult>(
        AssignNumberDialogComponent,
        { data },
      )
      .afterClosed()
      .subscribe(async (result) => {
        if (!result) return;
        try {
          await firstValueFrom(
            this.hub.post(`/resellers/phone-numbers/${number.id}/assign`, { customerId: result.customerId }),
          );
          this.notify.success('admin.numbers.assigned', { number: number.phoneNumber });
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  /**
   * Takes a number back into the pool. Calls to it stop reaching the customer
   * the moment this goes through, so the confirmation says so beforehand.
   */
  release(row: ResellerAssignedNumber): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.numbers.releaseTitle',
      messageKey: 'admin.numbers.releaseMessage',
      params: { number: row.phoneNumber.phoneNumber },
      confirmKey: 'admin.numbers.release',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.hub.post(`/resellers/phone-numbers/${row.phoneNumber.id}/release`));
          this.notify.success('admin.numbers.released');
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  importNumber(): void {
    this.dialog
      .open<ImportNumberDialogComponent, unknown, ImportNumberResult>(ImportNumberDialogComponent, {
        data: {},
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.notify.success('admin.numbers.imported', { number: result.phoneNumber });
        void this.load();
      });
  }
}
