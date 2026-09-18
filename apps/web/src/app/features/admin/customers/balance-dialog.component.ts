import { Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';

export interface BalanceDialogData {
  mode: 'add' | 'subtract';
  email: string;
  /** What the wallet holds right now, already formatted for the reader. */
  balance: string;
}

export interface BalanceDialogResult {
  amount: number;
  description: string;
}

/**
 * Asks for the amount to move and the reason for it. The reason is required
 * because it is what the customer and a later reader of the ledger see; the
 * page itself books the movement.
 */
@Component({
  selector: 'app-balance-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{
          t(data.mode === 'add' ? 'admin.customer.balance.addTitle' : 'admin.customer.balance.subtractTitle')
        }}
      </h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">
            {{ t('admin.customer.balance.dialogHint', { email: data.email, balance: data.balance }) }}
          </p>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.customer.balance.amount') }}</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              formControlName="amount"
              data-testid="amount"
            />
            <span matTextSuffix>EUR</span>
            @if (form.controls.amount | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.customer.balance.reason') }}</mat-label>
            <input matInput formControlName="description" maxlength="200" data-testid="reason" />
            @if (form.controls.description | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" data-testid="submit">
            {{ t(data.mode === 'add' ? 'admin.customer.balance.add' : 'admin.customer.balance.subtract') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BalanceDialogComponent {
  readonly data = inject<BalanceDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BalanceDialogComponent, BalanceDialogResult>>(MatDialogRef);

  readonly form = inject(NonNullableFormBuilder).group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({ amount: Number(value.amount), description: value.description.trim() });
  }
}
