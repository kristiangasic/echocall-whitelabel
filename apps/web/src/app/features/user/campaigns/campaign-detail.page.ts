import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { Campaign, Recipient } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { providePaginatorIntl } from '../../../shared/paginator-intl';

/** Statuses in which the hub still accepts a cancellation. */
const CANCELLABLE = ['pending', 'scheduled', 'running'];

@Component({
  selector: 'app-campaign-detail-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user'), providePaginatorIntl()],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ campaign()?.name || t('user.campaigns.title') }}</h1>
        <div class="head-actions">
          @if (canSubmit()) {
            <button
              mat-flat-button
              type="button"
              (click)="submit()"
              [disabled]="busy()"
              data-testid="campaign-submit"
            >
              <mat-icon>play_arrow</mat-icon>
              {{ t('user.campaigns.submit') }}
            </button>
          }
          @if (canCancel()) {
            <button
              mat-stroked-button
              type="button"
              (click)="cancel()"
              [disabled]="busy()"
              data-testid="campaign-cancel"
            >
              <mat-icon>stop</mat-icon>
              {{ t('user.campaigns.cancel') }}
            </button>
          }
          <button
            mat-stroked-button
            type="button"
            (click)="remove()"
            [disabled]="busy()"
            data-testid="campaign-delete"
          >
            <mat-icon>delete</mat-icon>
            {{ t('actions.delete') }}
          </button>
          <a mat-stroked-button routerLink="/app/campaigns">
            <mat-icon>arrow_back</mat-icon>
            {{ t('actions.back') }}
          </a>
        </div>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (campaign(); as c) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <dl class="facts inline">
              <div>
                <dt>{{ t('fields.status') }}</dt>
                <dd data-testid="campaign-status">{{ t('user.campaigns.statuses.' + c.status) }}</dd>
              </div>
              <div>
                <dt>{{ t('user.campaigns.recipients') }}</dt>
                <dd>{{ c.totalRecipients ?? 0 }}</dd>
              </div>
              <div>
                <dt>{{ t('user.campaigns.successful') }}</dt>
                <dd>{{ c.successfulCalls ?? 0 }}</dd>
              </div>
              <div>
                <dt>{{ t('user.campaigns.failed') }}</dt>
                <dd>{{ c.failedCalls ?? 0 }}</dd>
              </div>
              <div>
                <dt>{{ t('user.campaigns.pending') }}</dt>
                <dd>{{ c.pendingCalls ?? 0 }}</dd>
              </div>
              <div>
                <dt>{{ t('user.campaigns.created') }}</dt>
                <dd>{{ c.createdAt | localDate }}</dd>
              </div>
            </dl>
          </mat-card-content>
        </mat-card>
      }

      <h2 class="section-title">{{ t('user.campaigns.recipients') }}</h2>
      <div class="table-wrap">
        <table mat-table [dataSource]="recipients()" data-testid="recipients-table">
          <ng-container matColumnDef="phoneNumber">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.phoneNumber') }}</th>
            <td mat-cell *matCellDef="let r" [attr.data-label]="t('user.campaigns.phoneNumber')">
              {{ r.phoneNumber }}
            </td>
          </ng-container>
          <ng-container matColumnDef="callStatus">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let r" [attr.data-label]="t('fields.status')">
              {{ callStatus(t, r) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="duration">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.duration') }}</th>
            <td mat-cell *matCellDef="let r" [attr.data-label]="t('user.campaigns.duration')">
              {{ duration(r.durationSeconds) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="startedAt">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.campaigns.calledAt') }}</th>
            <td mat-cell *matCellDef="let r" [attr.data-label]="t('user.campaigns.calledAt')">
              {{ r.callStartedAt | localDate }}
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('user.campaigns.noRecipients') }}
            </td>
          </tr>
        </table>
      </div>
      @if (total() > perPage()) {
        <mat-paginator
          [length]="total()"
          [pageSize]="perPage()"
          [pageIndex]="page() - 1"
          [pageSizeOptions]="[50, 100]"
          (page)="changePage($event)"
        />
      }
    </ng-container>
  `,
  styles: `
    .section-title {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 8px;
    }
  `,
})
export class CampaignDetailPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly id = signal(0);
  readonly campaign = signal<Campaign | null>(null);
  readonly recipients = signal<Recipient[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(50);
  readonly total = signal(0);
  readonly columns = ['phoneNumber', 'callStatus', 'duration', 'startedAt'];

  readonly canSubmit = computed(() => this.campaign()?.status === 'draft');
  readonly canCancel = computed(() => CANCELLABLE.includes(this.campaign()?.status ?? ''));

  ngOnInit(): void {
    this.id.set(Number(this.route.snapshot.paramMap.get('id')));
    void this.load();
  }

  /** Falls back to the raw status when the hub reports one the portal has no text for. */
  callStatus(t: (key: string) => string, recipient: Recipient): string {
    const status = recipient.callStatus;
    if (!status) return '';
    const key = `user.campaigns.callStatuses.${status}`;
    const label = t(key);
    return label && label !== key ? label : status;
  }

  duration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    void this.loadRecipients();
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`/batch-calling/campaigns/${this.id()}/submit`));
      this.notify.success('user.campaigns.submitted');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async cancel(): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.campaigns.cancelTitle',
      messageKey: 'user.campaigns.cancelMessage',
      confirmKey: 'user.campaigns.cancel',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`/batch-calling/campaigns/${this.id()}/cancel`));
      this.notify.success('user.campaigns.cancelled');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.campaigns.deleteTitle',
      messageKey: 'user.campaigns.deleteMessage',
      params: { name: this.campaign()?.name ?? '' },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.delete(`/batch-calling/campaigns/${this.id()}`));
      await this.router.navigate(['/app/campaigns']);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.campaign.set(
        await firstValueFrom(this.hub.get<Campaign>(`/batch-calling/campaigns/${this.id()}`)),
      );
      await this.loadRecipients();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRecipients(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.page<Recipient>(`/batch-calling/campaigns/${this.id()}/recipients`, {
          page: this.page(),
          perPage: this.perPage(),
        }),
      );
      this.recipients.set(result.data);
      this.total.set(result.pagination?.total ?? result.data.length);
    } catch (err) {
      this.notify.apiError(err);
    }
  }
}
