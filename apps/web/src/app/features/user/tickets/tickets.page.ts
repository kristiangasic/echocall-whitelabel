import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { TicketSummary } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { TicketDialogComponent, type TicketDialogResult } from './ticket-dialog.component';

/** The filter chips above the table. `all` sends no status to the hub. */
const FILTERS = ['all', 'open', 'resolved'] as const;
type Filter = (typeof FILTERS)[number];

@Component({
  selector: 'app-tickets-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
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
          <h1 class="page-title">{{ t('user.tickets.title') }}</h1>
          <p class="page-hint">{{ t('user.tickets.hint') }}</p>
        </div>
        <button mat-flat-button type="button" (click)="create()" data-testid="ticket-create">
          <mat-icon>add</mat-icon>
          {{ t('user.tickets.create') }}
        </button>
      </div>

      <mat-button-toggle-group
        [value]="filter()"
        (change)="setFilter($event.value)"
        data-testid="ticket-filter"
        [attr.aria-label]="t('fields.status')"
      >
        @for (option of filters; track option) {
          <mat-button-toggle [value]="option">
            {{ t('user.tickets.filters.' + option) }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="tickets()" data-testid="tickets-table">
          <ng-container matColumnDef="subject">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.tickets.subject') }}</th>
            <td mat-cell *matCellDef="let ticket" [attr.data-label]="t('user.tickets.subject')">
              <a class="row-link" [routerLink]="['/app/tickets', ticket.id]">{{ ticket.subject }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let ticket" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + ticket.status">
                {{ t('user.tickets.statuses.' + ticket.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="priority">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.tickets.priority') }}</th>
            <td mat-cell *matCellDef="let ticket" [attr.data-label]="t('user.tickets.priority')">
              {{ ticket.priority ? t('user.tickets.priorities.' + ticket.priority) : '' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="updated">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.tickets.updated') }}</th>
            <td mat-cell *matCellDef="let ticket" [attr.data-label]="t('user.tickets.updated')">
              {{ ticket.updatedAt | localDate }}
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('user.tickets.empty') }}
            </td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
})
export class TicketsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly tickets = signal<TicketSummary[]>([]);
  readonly loading = signal(false);
  readonly filter = signal<Filter>('all');
  readonly columns = ['subject', 'status', 'priority', 'updated'];
  readonly filters = FILTERS;

  ngOnInit(): void {
    void this.load();
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
    void this.load();
  }

  async create(): Promise<void> {
    const result = await firstValueFrom(this.dialog.open(TicketDialogComponent).afterClosed());
    const created = result as TicketDialogResult | undefined;
    if (!created) return;
    await this.router.navigate(['/app/tickets', created.id]);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const filter = this.filter();
      this.tickets.set(
        await firstValueFrom(
          this.hub.list<TicketSummary>('/tickets', filter === 'all' ? {} : { status: filter }),
        ),
      );
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
