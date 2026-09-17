import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCustomer } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { type CustomerOption, customerOption } from '../customer-option';

/** How many customers the picker loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/** The number the operator started from, so the dialog can name it. */
export interface AssignNumberDialogData {
  phoneNumber: string;
}

/** Who the number goes to. */
export interface AssignNumberResult {
  customerId: number;
}

/**
 * Picks the customer one number goes to. The dialog only chooses; the page
 * calls the hub, because the page also has to read both lists again afterwards.
 */
@Component({
  selector: 'app-assign-number-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressBarModule,
    MatButtonModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('admin.numbers.assignDialog.title') }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">
            {{ t('admin.numbers.assignDialog.intro', { number: data.phoneNumber }) }}
          </p>
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.numbers.assignDialog.customer') }}</mat-label>
            <mat-select formControlName="customerId" data-testid="customer">
              @for (customer of customers(); track customer.id) {
                <mat-option [value]="customer.id">{{ customer.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" data-testid="submit">
            {{ t('admin.numbers.assignDialog.submit') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(480px, 90vw);
      padding-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AssignNumberDialogComponent implements OnInit {
  readonly data = inject<AssignNumberDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AssignNumberDialogComponent, AssignNumberResult>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);

  readonly loading = signal(false);
  readonly customers = signal<CustomerOption[]>([]);

  readonly form = inject(NonNullableFormBuilder).group({
    customerId: [null as number | null, Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close({ customerId: Number(this.form.getRawValue().customerId) });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.page<ResellerCustomer>('/resellers/customers', { perPage: CUSTOMER_PAGE }),
      );
      this.customers.set(result.data.map(customerOption));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
