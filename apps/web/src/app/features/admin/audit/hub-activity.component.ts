import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerActivity } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';

const PER_PAGE = 25;

/**
 * What the service recorded about the operator account itself. The portal keeps
 * its own audit trail, but everything an operator does at the service (creating
 * customers, changing prices, replacing payment keys) is only written there.
 */
@Component({
  selector: 'app-hub-activity',
  imports: [MatTableModule, MatPaginatorModule, MatProgressBarModule, TranslocoDirective, LocalDatePipe],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <p class="intro">{{ t('admin.audit.hub.intro') }}</p>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()" data-testid="hub-activity-table">
          <ng-container matColumnDef="createdAt">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.time') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.time')" class="nowrap">
              {{ row.createdAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.action') }}</th>
            <td
              mat-cell
              *matCellDef="let row"
              [attr.data-label]="t('admin.audit.action')"
              [title]="row.action"
            >
              {{ actionLabel(row.action) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.hub.description') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.hub.description')">
              {{ row.description ?? '' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="target">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.target') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.target')">
              @if (row.targetType) {
                {{ row.targetType }}{{ row.targetId ? ' #' + row.targetId : '' }}
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('admin.audit.hub.empty') }}
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
    .intro {
      color: var(--mat-sys-on-surface-variant);
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
export class HubActivityComponent implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);

  readonly columns = ['createdAt', 'action', 'description', 'target'];
  readonly rows = signal<ResellerActivity[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(PER_PAGE);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  /**
   * The service names an action with a technical key. Known keys get the
   * operator's own wording; anything the service adds later still shows, as the
   * key itself, rather than leaving the column empty.
   */
  actionLabel(action: string): string {
    const key = `admin.audit.hub.actions.${action}`;
    const label = this.transloco.translate(key);
    return label === key ? action : label;
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.page<ResellerActivity>('/resellers/activity-log', {
          page: this.page(),
          perPage: this.perPage(),
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
}
