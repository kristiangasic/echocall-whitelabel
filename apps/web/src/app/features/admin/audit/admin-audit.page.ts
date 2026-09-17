import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { AuditEntry, Page } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';

@Component({
  selector: 'app-admin-audit-page',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('admin.audit.title') }}</h1>
      <p class="intro">{{ t('admin.audit.intro') }}</p>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="page().data" data-testid="audit-table">
          <ng-container matColumnDef="createdAt">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.time') }}</th>
            <td mat-cell *matCellDef="let row" class="nowrap">{{ row.createdAt | localDate }}</td>
          </ng-container>
          <ng-container matColumnDef="actor">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.actor') }}</th>
            <td mat-cell *matCellDef="let row">{{ row.actorEmail ?? t('admin.audit.system') }}</td>
          </ng-container>
          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.action') }}</th>
            <td mat-cell *matCellDef="let row">
              <code>{{ row.action }}</code>
            </td>
          </ng-container>
          <ng-container matColumnDef="target">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.target') }}</th>
            <td mat-cell *matCellDef="let row">
              @if (row.targetType) {
                {{ row.targetType }}{{ row.targetId ? ' #' + row.targetId : '' }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="details">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.details') }}</th>
            <td mat-cell *matCellDef="let row">
              @if (row.details) {
                <code class="details" [matTooltip]="details(row)">{{ details(row) }}</code>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="ip">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.ip') }}</th>
            <td mat-cell *matCellDef="let row" class="nowrap">{{ row.ip ?? '' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('admin.audit.empty') }}</td>
          </tr>
        </table>
      </div>
      <mat-paginator
        [length]="page().meta.total"
        [pageIndex]="page().meta.page - 1"
        [pageSize]="page().meta.limit"
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
    .details {
      display: inline-block;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: middle;
    }
    .empty {
      padding: 24px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminAuditPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly columns = ['createdAt', 'actor', 'action', 'target', 'details', 'ip'];
  readonly page = signal<Page<AuditEntry>>({ data: [], meta: { page: 1, limit: 50, total: 0 } });
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load(1, 50);
  }

  details(row: AuditEntry): string {
    return JSON.stringify(row.details);
  }

  onPage(event: PageEvent): void {
    void this.load(event.pageIndex + 1, event.pageSize);
  }

  async load(page: number, limit: number): Promise<void> {
    this.loading.set(true);
    try {
      this.page.set(await firstValueFrom(this.api.get<Page<AuditEntry>>('/admin/audit', { page, limit })));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
