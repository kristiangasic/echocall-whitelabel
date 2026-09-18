import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { agentNumber } from '../../../core/hub/agent-id';
import { HubService } from '../../../core/hub/hub.service';
import type { AgentSummary, PhoneNumber } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { PurchaseDialogComponent, type PurchaseResult } from './purchase-dialog.component';

/** What cancelling a number reports back, including when it stops working. */
interface CancelResult {
  cancelationEndDate: string;
}

/**
 * The numbers on the account: which agent answers on each, what it costs and
 * whether the registry has cleared it for traffic. Numbers are bought through
 * the marketplace dialog and cancelled with a grace period.
 */
@Component({
  selector: 'app-phone-numbers-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.numbers.title') }}</h1>
        <button mat-flat-button type="button" (click)="openPurchase()" data-testid="buy-number">
          <mat-icon>add</mat-icon>
          {{ t('user.numbers.purchase') }}
        </button>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="table-wrap">
        <table mat-table [dataSource]="numbers()" data-testid="numbers-table">
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.numbers.number') }}</th>
            <td mat-cell *matCellDef="let n" [attr.data-label]="t('user.numbers.number')">
              <span class="number">{{ n.phoneNumber }}</span>
              <span class="sub">{{ typeLabel(t, n.numberType) }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="label">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.numbers.label') }}</th>
            <td mat-cell *matCellDef="let n" [attr.data-label]="t('user.numbers.label')">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="inline-field">
                <input
                  matInput
                  [ngModel]="n.friendlyName || ''"
                  (change)="saveLabel(n, $any($event.target).value)"
                  [attr.aria-label]="t('user.numbers.label')"
                  data-testid="number-label"
                />
              </mat-form-field>
            </td>
          </ng-container>

          <ng-container matColumnDef="agent">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.numbers.agent') }}</th>
            <td mat-cell *matCellDef="let n" [attr.data-label]="t('user.numbers.agent')">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="inline-field">
                <mat-select
                  [ngModel]="n.voiceAgentId"
                  (ngModelChange)="assign(n, $event)"
                  [attr.aria-label]="t('user.numbers.agent')"
                  data-testid="number-agent"
                >
                  <mat-option [value]="null">{{ t('user.numbers.agentNone') }}</mat-option>
                  @for (agent of agents(); track agent.id) {
                    <mat-option [value]="agentNumber(agent.id)">{{ agent.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </td>
          </ng-container>

          <ng-container matColumnDef="kyc">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.numbers.kyc') }}</th>
            <td mat-cell *matCellDef="let n" [attr.data-label]="t('user.numbers.kyc')">
              <span
                class="status"
                [class]="'status status-kyc-' + kyc(n)"
                [matTooltip]="t('user.numbers.kycHints.' + kyc(n))"
              >
                {{ t('user.numbers.kycStatuses.' + kyc(n)) }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="monthly">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.numbers.monthly') }}</th>
            <td mat-cell *matCellDef="let n" [attr.data-label]="t('user.numbers.monthly')">
              {{ money(n.monthlyPrice) }}
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let n" class="cell-actions">
              @if (n.cancelationEndDate) {
                <span class="sub" data-testid="number-cancelled">
                  {{ t('user.numbers.until', { date: (n.cancelationEndDate | localDate) || '' }) }}
                </span>
              } @else {
                <button
                  mat-icon-button
                  type="button"
                  (click)="cancel(n)"
                  [attr.aria-label]="t('user.numbers.cancel')"
                  data-testid="number-cancel"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('user.numbers.empty') }}</td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
  styles: `
    .number {
      display: block;
      font-weight: 500;
    }
    .sub {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .inline-field {
      width: 100%;
      min-width: 140px;
    }
  `,
})
export class PhoneNumbersPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly numbers = signal<PhoneNumber[]>([]);
  readonly agents = signal<AgentSummary[]>([]);
  readonly loading = signal(false);
  readonly columns = ['number', 'label', 'agent', 'kyc', 'monthly', 'actions'];
  /** Used by the template to match an agent to the id stored on the number. */
  readonly agentNumber = agentNumber;

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  /** Numbers from countries without a registry requirement come back without a state. */
  kyc(number: PhoneNumber): string {
    return number.kycStatus ?? 'not_required';
  }

  typeLabel(t: (key: string) => string, type: string | null | undefined): string {
    if (!type) return '';
    const key = `user.numbers.types.${type}`;
    const label = t(key);
    return label && label !== key ? label : type;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [numbers, agents] = await Promise.all([
        firstValueFrom(this.hub.list<PhoneNumber>('/phone-numbers', { perPage: 100 })),
        firstValueFrom(this.hub.list<AgentSummary>('/agents')),
      ]);
      this.numbers.set(numbers);
      this.agents.set(agents);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async assign(number: PhoneNumber, voiceAgentId: number | null): Promise<void> {
    if (voiceAgentId === number.voiceAgentId) return;
    await this.update(number, { voiceAgentId }, 'user.numbers.assigned');
  }

  async saveLabel(number: PhoneNumber, label: string): Promise<void> {
    const next = label.trim();
    if (next === (number.friendlyName ?? '')) return;
    await this.update(number, { label: next }, 'user.numbers.labelSaved');
  }

  async cancel(number: PhoneNumber): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.numbers.cancelTitle',
      messageKey: 'user.numbers.cancelMessage',
      params: { number: number.phoneNumber },
      confirmKey: 'user.numbers.cancel',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.hub.delete<CancelResult>(`/phone-numbers/${number.id}`));
      this.notify.success('user.numbers.cancelled', {
        date: new Date(result.cancelationEndDate).toLocaleDateString(this.language.current()),
      });
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
      this.loading.set(false);
    }
  }

  async openPurchase(): Promise<void> {
    const result = await firstValueFrom(
      this.dialog
        .open<PurchaseDialogComponent, undefined, PurchaseResult>(PurchaseDialogComponent, {
          panelClass: 'dialog-wide',
        })
        .afterClosed(),
    );
    if (!result) return;
    this.notify.success(result.kycRequired ? 'user.numbers.purchasedKyc' : 'user.numbers.purchased', {
      number: result.number,
    });
    await this.load();
  }

  private async update(
    number: PhoneNumber,
    body: Record<string, unknown>,
    successKey: string,
  ): Promise<void> {
    this.loading.set(true);
    try {
      await firstValueFrom(this.hub.patch(`/phone-numbers/${number.id}`, body));
      this.notify.success(successKey);
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
      this.loading.set(false);
    }
  }
}
