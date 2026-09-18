import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { readApiError } from '../../../core/errors/api-error';
import {
  type CreateCustomerInput,
  type CreateCustomerResult,
  type CustomerLoginResult,
  type Language,
  LANGUAGES,
  type UpdateCustomerInput,
} from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import type { CustomerRow } from './customer-row';

export type CustomerDialogData =
  { mode: 'create'; defaultLanguage: string } | { mode: 'edit'; customer: CustomerRow };

export type CustomerDialogResult =
  { mode: 'create'; result: CreateCustomerResult } | { mode: 'edit'; result: CustomerLoginResult };

/** Creates a customer together with its portal login, or edits the two of them at once. */
@Component({
  selector: 'app-customer-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{
          t(
            data.mode === 'create' ? 'admin.customers.dialog.createTitle' : 'admin.customers.dialog.editTitle'
          )
        }}
      </h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          @if (data.mode === 'create') {
            <p class="hint">{{ t('admin.customers.dialog.createIntro') }}</p>
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.email') }}</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="off" data-testid="email" />
            @if (form.controls.email | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.firstName') }}</mat-label>
              <input matInput formControlName="firstName" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.lastName') }}</mat-label>
              <input matInput formControlName="lastName" />
            </mat-form-field>
          </div>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.company') }}</mat-label>
              <input matInput formControlName="company" data-testid="company" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.language') }}</mat-label>
              <mat-select formControlName="language" data-testid="language">
                @for (lang of languages; track lang) {
                  <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (data.mode === 'create') {
            <mat-checkbox formControlName="sendInvite" data-testid="send-invite">
              {{ t('admin.customers.dialog.sendInvite') }}
            </mat-checkbox>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t(data.mode === 'create' ? 'admin.customers.dialog.createSubmit' : 'actions.save') }}
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
export class CustomerDialogComponent {
  readonly data = inject<CustomerDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CustomerDialogComponent, CustomerDialogResult>>(MatDialogRef);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly languages = LANGUAGES;
  readonly busy = signal(false);

  private readonly customer = this.data.mode === 'edit' ? this.data.customer : null;

  readonly form = inject(NonNullableFormBuilder).group({
    email: [this.customer?.email ?? '', [Validators.required, Validators.email]],
    firstName: [this.customer?.firstName ?? '', Validators.maxLength(100)],
    lastName: [this.customer?.lastName ?? '', Validators.maxLength(100)],
    company: [this.customer?.company ?? '', Validators.maxLength(200)],
    language: [
      this.data.mode === 'edit'
        ? (this.data.customer.login?.language ?? 'en')
        : (this.data.defaultLanguage as Language),
    ],
    sendInvite: [true],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      if (this.data.mode === 'create') {
        const body: CreateCustomerInput = {
          email: value.email,
          language: value.language as Language,
          sendInvite: value.sendInvite,
          ...(value.firstName ? { firstName: value.firstName } : {}),
          ...(value.lastName ? { lastName: value.lastName } : {}),
          ...(value.company ? { company: value.company } : {}),
        };
        const result = await firstValueFrom(this.api.post<CreateCustomerResult>('/admin/customers', body));
        this.ref.close({ mode: 'create', result });
      } else {
        // Every field is sent, empty string included: that is how a name is cleared.
        const body: UpdateCustomerInput = {
          email: value.email,
          firstName: value.firstName,
          lastName: value.lastName,
          company: value.company,
          language: value.language as Language,
        };
        const result = await firstValueFrom(
          this.api.patch<CustomerLoginResult>(`/admin/customers/${this.data.customer.customerId}`, body),
        );
        this.ref.close({ mode: 'edit', result });
      }
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'email_taken' || error.code === 'validation_error') {
        this.form.controls.email.setErrors({ server: error.message });
      } else if (!applyServerErrors(this.form, error)) {
        this.notify.apiError(err);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
