import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { AgentSummary } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';

@Component({
  selector: 'app-agents-page',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.agents.title') }}</h1>
        <a mat-flat-button routerLink="/app/agents/new" data-testid="create-agent">
          <mat-icon>add</mat-icon>
          {{ t('user.agents.create') }}
        </a>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="agents()" data-testid="agents-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.name') }}</th>
            <td mat-cell *matCellDef="let a">
              <a class="row-link" [routerLink]="['/app/agents', a.id]">{{ a.name }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="language">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.agents.language') }}</th>
            <td mat-cell *matCellDef="let a">{{ a.language || '' }}</td>
          </ng-container>
          <ng-container matColumnDef="voice">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.agents.voice') }}</th>
            <td mat-cell *matCellDef="let a">{{ a.voice?.name || '' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let a">
              <span class="status" [class]="'status status-' + a.status">
                {{ t('user.agents.statuses.' + a.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let a" class="cell-actions">
              <a mat-icon-button [routerLink]="['/app/agents', a.id]" [attr.aria-label]="t('actions.edit')">
                <mat-icon>edit</mat-icon>
              </a>
              <button
                mat-icon-button
                type="button"
                (click)="remove(a)"
                [attr.aria-label]="t('actions.delete')"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('user.agents.empty') }}</td>
          </tr>
        </table>
      </div>
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
  `,
})
export class AgentsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly agents = signal<AgentSummary[]>([]);
  readonly loading = signal(false);
  readonly columns = ['name', 'language', 'voice', 'status', 'actions'];

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.agents.set(await firstValueFrom(this.hub.list<AgentSummary>('/agents')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async remove(agent: AgentSummary): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.agents.deleteTitle',
      messageKey: 'user.agents.deleteMessage',
      params: { name: agent.name },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, { data }).afterClosed(),
    );
    if (!confirmed) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.hub.delete(`/agents/${agent.id}`));
      this.notify.success('user.agents.deleted');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
      this.loading.set(false);
    }
  }
}
