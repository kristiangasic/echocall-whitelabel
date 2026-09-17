import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { Plan } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { PlanDialogComponent, type PlanDialogData } from './plan-dialog.component';
import { AdminPricingPanel } from './pricing.panel';

/**
 * The plans customers subscribe to, and underneath them the two prices that
 * apply to what those customers actually use.
 */
@Component({
  selector: 'app-admin-plans-page',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    TranslocoDirective,
    AdminPricingPanel,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('admin.plans.title') }}</h1>
        <button mat-flat-button type="button" (click)="create()" data-testid="create-plan">
          <mat-icon>add</mat-icon>
          {{ t('admin.plans.create') }}
        </button>
      </div>
      <p class="intro">{{ t('admin.plans.intro') }}</p>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="plans()" data-testid="plans-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.name') }}</th>
            <td mat-cell *matCellDef="let p">
              <div>{{ p.name }}</div>
              @if (p.description) {
                <div class="cell-sub">{{ p.description }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.plans.type') }}</th>
            <td mat-cell *matCellDef="let p">{{ t('admin.plans.types.' + p.type) }}</td>
          </ng-container>
          <ng-container matColumnDef="billingCycle">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.plans.billingCycle') }}</th>
            <td mat-cell *matCellDef="let p">{{ t('admin.plans.cycles.' + p.billingCycle) }}</td>
          </ng-container>
          <ng-container matColumnDef="price">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.plans.price') }}</th>
            <td mat-cell *matCellDef="let p" class="numeric">{{ money(p.priceEur) }}</td>
          </ng-container>
          <ng-container matColumnDef="allowances">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.plans.allowances') }}</th>
            <td mat-cell *matCellDef="let p">
              @if (p.voiceMinutesPerMonth !== null || p.chatConversationsPerMonth !== null) {
                @if (p.voiceMinutesPerMonth !== null) {
                  <div>{{ t('admin.plans.voiceMinutes', { count: p.voiceMinutesPerMonth }) }}</div>
                }
                @if (p.chatConversationsPerMonth !== null) {
                  <div>{{ t('admin.plans.chatConversations', { count: p.chatConversationsPerMonth }) }}</div>
                }
              } @else {
                {{ t('admin.plans.unlimited') }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let p">
              <span class="status" [class]="p.isActive ? 'status status-active' : 'status status-disabled'">
                {{ t(p.isActive ? 'admin.plans.active' : 'admin.plans.inactive') }}
              </span>
              @if (!p.isVisible) {
                <div class="cell-sub">{{ t('admin.plans.hidden') }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let p" class="cell-actions">
              <button
                mat-icon-button
                type="button"
                [matMenuTriggerFor]="menu"
                [matMenuTriggerData]="{ plan: p }"
                [attr.aria-label]="t('actions.more')"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('admin.plans.empty') }}</td>
          </tr>
        </table>
      </div>

      <mat-menu #menu="matMenu">
        <ng-template matMenuContent let-plan="plan">
          <button mat-menu-item type="button" (click)="edit(plan)">
            <mat-icon>edit</mat-icon>
            <span>{{ t('actions.edit') }}</span>
          </button>
          <button mat-menu-item type="button" (click)="remove(plan)">
            <mat-icon>delete</mat-icon>
            <span>{{ t('actions.delete') }}</span>
          </button>
        </ng-template>
      </mat-menu>

      <app-admin-pricing-panel />
    </ng-container>
  `,
  styles: `
    .intro {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
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
    .empty {
      padding: 24px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    app-admin-pricing-panel {
      display: block;
      margin-top: 32px;
    }
  `,
})
export class AdminPlansPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly columns = ['name', 'type', 'billingCycle', 'price', 'allowances', 'status', 'actions'];
  readonly plans = signal<Plan[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.plans.set(await firstValueFrom(this.hub.get<Plan[]>('/resellers/plans')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  create(): void {
    this.open({ mode: 'create' }, 'admin.plans.created');
  }

  edit(plan: Plan): void {
    this.open({ mode: 'edit', plan }, 'admin.plans.saved');
  }

  /**
   * The hub refuses to delete a plan any subscription still points at and says
   * so with its own code, which the portal repeats instead of guessing.
   */
  remove(plan: Plan): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.plans.deleteTitle',
      messageKey: 'admin.plans.deleteMessage',
      params: { name: plan.name },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.hub.delete(`/resellers/plans/${plan.id}`));
          this.notify.success('admin.plans.deleted');
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  private open(data: PlanDialogData, successKey: string): void {
    this.dialog
      .open<PlanDialogComponent, PlanDialogData, boolean>(PlanDialogComponent, { data })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.notify.success(successKey);
        void this.load();
      });
  }
}
