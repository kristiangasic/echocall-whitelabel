import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { readApiError } from '../../../core/errors/api-error';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerAddonPackage, ResellerCustomer } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { type CustomerOption, customerOption } from '../customer-option';

/** How many customers the picker loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/** The two ways the hub can settle a sale. */
const PAYMENTS = ['balance', 'manual'] as const;

/**
 * What the page hands over: the package of the row the sale was started from,
 * if it was started from a row at all.
 */
export interface SellAddonDialogData {
  packageId?: number;
}

/** What the dialog reports back, so the page can say how much was granted. */
export interface SellAddonResult {
  creditsGranted: number;
}

/**
 * The two refusals the hub has for a sale are both about the customer, and the
 * shared texts for them are written for a customer reading about themselves.
 * Here an operator is selling to someone else, so each gets its own wording.
 */
const OWN_MESSAGES: Record<string, string> = {
  insufficient_balance: 'admin.addons.dialog.balanceTooLow',
  no_subscription: 'admin.addons.dialog.noSubscription',
};

/**
 * Sells one credit package to one customer. The credits are granted the moment
 * this goes through, so the dialog says what happens before it happens, and it
 * offers the two settlement routes as a plain choice rather than a default.
 */
@Component({
  selector: 'app-sell-addon-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatRadioModule,
    MatProgressBarModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('admin.addons.dialog.title') }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">{{ t('admin.addons.dialog.intro') }}</p>
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.addons.dialog.customer') }}</mat-label>
            <mat-select formControlName="customerId" data-testid="customer">
              @for (customer of customers(); track customer.id) {
                <mat-option [value]="customer.id">{{ customer.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.customerId | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.addons.dialog.package') }}</mat-label>
            <mat-select formControlName="packageId" data-testid="package">
              @for (item of packages(); track item.id) {
                <mat-option [value]="item.id">
                  {{ item.name }} - {{ t('admin.addons.units.' + item.type, { count: item.quantity }) }} -
                  {{ money(item.totalPrice) }}
                </mat-option>
              }
            </mat-select>
            @if (form.controls.packageId | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          @if (!loading() && packages().length === 0) {
            <p class="hint" data-testid="no-packages">{{ t('admin.addons.dialog.noPackages') }}</p>
          }
          <fieldset>
            <legend>{{ t('admin.addons.dialog.payment') }}</legend>
            <mat-radio-group formControlName="paymentMethod" data-testid="payment">
              @for (payment of payments; track payment) {
                <mat-radio-button [value]="payment">
                  {{ t('admin.addons.dialog.payments.' + payment) }}
                </mat-radio-button>
              }
            </mat-radio-group>
            <p class="hint small">{{ t('admin.addons.dialog.paymentHint') }}</p>
          </fieldset>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t('admin.addons.dialog.submit') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    .hint {
      margin: 0 0 16px;
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
    }
    legend {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
      padding: 0 0 8px;
    }
    mat-radio-group {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class SellAddonDialogComponent implements OnInit {
  private readonly data = inject<SellAddonDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SellAddonDialogComponent, SellAddonResult>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly payments = PAYMENTS;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly packages = signal<ResellerAddonPackage[]>([]);
  readonly customers = signal<CustomerOption[]>([]);

  readonly form = inject(NonNullableFormBuilder).group({
    customerId: [null as number | null, Validators.required],
    packageId: [this.data.packageId ?? null, Validators.required],
    paymentMethod: ['balance' as (typeof PAYMENTS)[number], Validators.required],
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
      const [customers, packages] = await Promise.all([
        firstValueFrom(this.hub.page<ResellerCustomer>('/resellers/customers', { perPage: CUSTOMER_PAGE })),
        firstValueFrom(this.hub.list<ResellerAddonPackage>('/resellers/addons/packages')),
      ]);
      this.customers.set(customers.data.map(customerOption));
      this.packages.set(packages);
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
      const result = await firstValueFrom(
        this.hub.post<{ creditsGranted: number }>('/resellers/addons/sell', {
          customerId: Number(value.customerId),
          packageId: Number(value.packageId),
          paymentMethod: value.paymentMethod,
        }),
      );
      this.ref.close({ creditsGranted: result.creditsGranted });
    } catch (err) {
      const own = OWN_MESSAGES[readApiError(err).code];
      if (own) this.notify.error(own);
      else this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
