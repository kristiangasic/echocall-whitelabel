import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { CampaignSummary } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  CampaignDialogComponent,
  type CampaignDialogResult,
} from './campaign-dialog.component';

/** The filter chips above the table. `all` sends no status to the hub. */
const FILTERS = ['all', 'draft', 'running', 'completed'] as const;
type Filter = (typeof FILTERS)[number];

@Component({
  selector: 'app-campaigns-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('user.campaigns.title') }}</h1>
          <p class="page-hint">{{ t('user.campaigns.hint') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="create()" data-testid="campaign-create">
          <mat-icon>add</mat-icon>
          {{ t('user.campaigns.create') }}
        </button>
      </div>

      <mat-button-toggle-group
        [value]="filter()"
        (change)="setFilter($event.value)"
        data-testid="campaign-filter"
        [attr.aria-label]="t('fields.status')"
      >
        @for (option of filters; track option) {
          <mat-button-toggle [value]="option">
            {{ t('user.campaigns.filters.' + option) }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="campaigns()" data-testid="campaigns-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.name') }}</th>
            <td mat-cell *matCellDef="let c">
              <a class="row-link" [routerLink]="['/app/campaigns', c.id]">{{ c.name }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let c">
              <span class="status" [class]="'status status-' + c.status">
                {{ t('user.campaigns.statuses.' + c.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="progress">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.progress') }}</th>
            <td mat-cell *matCellDef="let c">{{ progress(c) }}</td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.created') }}</th>
            <td mat-cell *matCellDef="let c">{{ c.createdAt | localDate }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t(filter() === 'all' ? 'user.campaigns.empty' : 'user.campaigns.emptyFiltered') }}
            </td>
          </tr>
        </table>
      </div>
      <mat-paginator
        [length]="total()"
        [pageSize]="perPage()"
        [pageIndex]="page() - 1"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="changePage($event)"
      />
    </ng-container>
  `,
  styles: `
    .row-link {
      color: inherit;
      text-decoration: none;
      font-weight: 500;
    }
    .row-link:hover {
      text-decoration: underline;
    }
    mat-button-toggle-group {
      margin-bottom: 16px;
    }
  `,
})
export class CampaignsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly campaigns = signal<CampaignSummary[]>([]);
  readonly loading = signal(false);
  readonly filter = signal<Filter>('all');
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly total = signal(0);
  readonly columns = ['name', 'status', 'progress', 'created'];
  readonly filters = FILTERS;

  ngOnInit(): void {
    void this.load();
  }

  /** Reached calls out of the total, so a running campaign shows how far it got. */
  progress(campaign: CampaignSummary): string {
    const total = campaign.totalRecipients ?? 0;
    const done = (campaign.successfulCalls ?? 0) + (campaign.failedCalls ?? 0);
    return `${done} / ${total}`;
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
    this.page.set(1);
    void this.load();
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.load();
  }

  async create(): Promise<void> {
    const result = await firstValueFrom(
      this.dialog.open(CampaignDialogComponent).afterClosed(),
    );
    const created = result as CampaignDialogResult | undefined;
    if (!created) return;
    await this.router.navigate(['/app/campaigns', created.id]);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const filter = this.filter();
      const result = await firstValueFrom(
        this.hub.page<CampaignSummary>('/batch-calling/campaigns', {
          page: this.page(),
          perPage: this.perPage(),
          ...(filter === 'all' ? {} : { status: filter }),
        }),
      );
      this.campaigns.set(result.data);
      this.total.set(result.pagination?.total ?? result.data.length);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
