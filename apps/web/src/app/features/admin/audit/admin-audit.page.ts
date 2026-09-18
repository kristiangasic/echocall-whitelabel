import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { AuditEntry, Page } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { NO_VALUE } from '../../../shared/no-value';
import { providePaginatorIntl } from '../../../shared/paginator-intl';
import { auditAction, auditDetails, auditTarget } from './audit-entry';
import { HubActivityComponent } from './hub-activity.component';

@Component({
  selector: 'app-admin-audit-page',
  imports: [
    MatTableModule,
    MatTabsModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    LocalDatePipe,
    HubActivityComponent,
  ],
  providers: [provideTranslocoScope('admin'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('admin.audit.title') }}</h1>
      <mat-tab-group [mat-stretch-tabs]="false" [selectedIndex]="tab()" (selectedIndexChange)="onTab($event)">
        <mat-tab [label]="t('admin.audit.localTab')">
          <div class="tab-body">
            <p class="intro">{{ t('admin.audit.intro') }}</p>
            @if (loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <div class="table-wrap">
              <table mat-table [dataSource]="page().data" data-testid="audit-table">
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.time') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.time')" class="nowrap">
                    {{ row.createdAt | localDate }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="actor">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.actor') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.actor')">
                    {{ row.actorEmail ?? t('admin.audit.system') }}
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
                <ng-container matColumnDef="target">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.target') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.target')">
                    @if (row.targetType) {
                      {{ targetLabel(row) }}
                    } @else {
                      <span class="empty">{{ noValue }}</span>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="details">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.details') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.details')">
                    @if (row.details) {
                      <span class="details" [matTooltip]="details(row)">{{ details(row) }}</span>
                    } @else {
                      <span class="empty">{{ noValue }}</span>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="ip">
                  <th mat-header-cell *matHeaderCellDef>{{ t('admin.audit.ip') }}</th>
                  <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.audit.ip')" class="nowrap">
                    {{ row.ip ?? noValue }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"></tr>
                <tr class="mat-row" *matNoDataRow>
                  <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('admin.audit.empty') }}</td>
                </tr>
              </table>
            </div>
            @if (page().meta.total > page().meta.limit) {
              <mat-paginator
                [length]="page().meta.total"
                [pageIndex]="page().meta.page - 1"
                [pageSize]="page().meta.limit"
                [pageSizeOptions]="[25, 50, 100]"
                (page)="onPage($event)"
              />
            }
          </div>
        </mat-tab>

        <mat-tab [label]="t('admin.audit.hub.tab')">
          <div class="tab-body">
            @if (hubOpened()) {
              <app-hub-activity />
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </ng-container>
  `,
  styles: `
    .tab-body {
      padding: 24px 0;
    }
    .intro {
      color: var(--mat-sys-on-surface-variant);
    }
    .nowrap {
      white-space: nowrap;
    }
    .details {
      display: inline-block;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: middle;
    }
    /* In a card the cell has the width of the card and no column to keep to,
       so what was cut short on a wide screen is simply read over two lines. */
    @media (max-width: 700px) {
      .details {
        max-width: none;
        white-space: normal;
      }
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminAuditPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);

  /** What a cell shows where there is nothing to put in it. */
  readonly noValue = NO_VALUE;
  readonly columns = ['createdAt', 'actor', 'action', 'target', 'details', 'ip'];
  readonly page = signal<Page<AuditEntry>>({ data: [], meta: { page: 1, limit: 50, total: 0 } });
  readonly loading = signal(false);
  /**
   * The service trail is fetched the first time its tab is opened and kept
   * afterwards, so moving between the tabs costs nothing.
   */
  readonly hubOpened = signal(false);
  readonly tab = signal(0);

  ngOnInit(): void {
    void this.load(1, 50);
  }

  onTab(index: number): void {
    this.tab.set(index);
    if (index === 1) this.hubOpened.set(true);
  }

  /** The recorded action in the reader's language; the key stays as the title. */
  actionLabel(action: string): string {
    return auditAction(action, (key) => this.transloco.translate(key));
  }

  /** What the entry recorded, as labelled values rather than as stored JSON. */
  targetLabel(row: AuditEntry): string {
    return auditTarget(row.targetType, row.targetId, (key) => this.transloco.translate(key));
  }

  details(row: AuditEntry): string {
    return auditDetails(row.details, (key) => this.transloco.translate(key));
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
