import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { Plan, ResellerCustomer } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { type CustomerOption, customerOption } from '../customer-option';

/** The contract lengths the hub accepts, in months and as the strings it wants. */
const DURATIONS = ['3', '6', '12'] as const;

/** How many customers the picker loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/**
 * Puts one customer on one plan. Both lists come from the hub, because a
 * subscription can only point at a customer and a plan that already exist
 * there, and a plan that is no longer sold is left out of the choice.
 */
@Component({
  selector: 'app-subscription-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('admin.subscriptions.dialog.title') }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">{{ t('admin.subscriptions.dialog.intro') }}</p>
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
            <mat-label>{{ t('admin.subscriptions.customer') }}</mat-label>
            <mat-select formControlName="customerId" data-testid="customer">
              @for (customer of customers(); track customer.id) {
                <mat-option [value]="customer.id">{{ customer.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.customerId | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
            <mat-hint>{{ t('admin.subscriptions.dialog.customerHint') }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.subscriptions.plan') }}</mat-label>
            <mat-select formControlName="planId" data-testid="plan">
              @for (plan of plans(); track plan.id) {
                <mat-option [value]="plan.id">
                  {{ plan.name }} - {{ money(plan.priceEur) }} ({{
                    t('admin.plans.cycles.' + plan.billingCycle)
                  }})
                </mat-option>
              }
            </mat-select>
            @if (form.controls.planId | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          @if (!loading() && plans().length === 0) {
            <p class="hint" data-testid="no-plans">{{ t('admin.subscriptions.dialog.noPlans') }}</p>
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.subscriptions.term') }}</mat-label>
            <mat-select formControlName="contractDuration" data-testid="duration">
              @for (duration of durations; track duration) {
                <mat-option [value]="duration">
                  {{ t('admin.subscriptions.months', { count: duration }) }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t('admin.subscriptions.dialog.submit') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(520px, 90vw);
      padding-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SubscriptionDialogComponent implements OnInit {
  private readonly ref = inject<MatDialogRef<SubscriptionDialogComponent, boolean>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly durations = DURATIONS;
  readonly loading = signal(false);
  readonly busy = signal(false);
  private readonly allPlans = signal<Plan[]>([]);
  readonly customers = signal<CustomerOption[]>([]);

  /** A plan that is switched off can no longer be sold, so it is not on offer here. */
  readonly plans = computed(() => this.allPlans().filter((plan) => plan.isActive));

  readonly form = inject(NonNullableFormBuilder).group({
    customerId: [null as number | null, Validators.required],
    planId: [null as number | null, Validators.required],
    contractDuration: ['12' as (typeof DURATIONS)[number], Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  money(value: string | number | null | undefined): string {
    return formatMoney(value, this.language.current());
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [customers, plans] = await Promise.all([
        firstValueFrom(this.hub.page<ResellerCustomer>('/resellers/customers', { perPage: CUSTOMER_PAGE })),
        firstValueFrom(this.hub.get<Plan[]>('/resellers/plans')),
      ]);
      this.customers.set(customers.data.map(customerOption));
      this.allPlans.set(plans);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      await firstValueFrom(
        this.hub.post('/resellers/subscriptions', {
          customerId: Number(value.customerId),
          planId: Number(value.planId),
          contractDuration: value.contractDuration,
        }),
      );
      this.ref.close(true);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
