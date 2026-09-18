import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { readApiError } from '../../../core/errors/api-error';
import {
  type AdminUser,
  type InviteInput,
  type InviteResult,
  LANGUAGES,
  type Role,
  type UserUpdate,
} from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { integerValidator } from '../../../shared/forms/validators';

export type UserDialogData = { mode: 'invite'; defaultLanguage: string } | { mode: 'edit'; user: AdminUser };

export type UserDialogResult = { mode: 'invite'; result: InviteResult } | { mode: 'edit'; user: AdminUser };

/** Invites a new account or edits role, names, language and customer link of an existing one. */
@Component({
  selector: 'app-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{ t(data.mode === 'invite' ? 'admin.users.dialog.inviteTitle' : 'admin.users.dialog.editTitle') }}
      </h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          @if (data.mode === 'invite') {
            <p class="hint">{{ t('admin.users.dialog.inviteIntro') }}</p>
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
              <mat-label>{{ t('fields.role') }}</mat-label>
              <mat-select formControlName="role" data-testid="role">
                <mat-option value="user">{{ t('roles.user') }}</mat-option>
                <mat-option value="admin">{{ t('roles.admin') }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.language') }}</mat-label>
              <mat-select formControlName="language">
                @for (lang of languages; track lang) {
                  <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (form.controls.role.value === 'user') {
            <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
              <mat-label>{{ t('fields.customerId') }}</mat-label>
              <input
                matInput
                inputmode="numeric"
                formControlName="echocallCustomerId"
                data-testid="customer-id"
              />
              <mat-hint>{{ t('admin.users.dialog.customerHint') }}</mat-hint>
              @if (form.controls.echocallCustomerId | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t(data.mode === 'invite' ? 'admin.users.dialog.inviteSubmit' : 'actions.save') }}
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
export class UserDialogComponent {
  readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UserDialogComponent, UserDialogResult>>(MatDialogRef);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly languages = LANGUAGES;
  readonly busy = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    email: [
      { value: this.data.mode === 'edit' ? this.data.user.email : '', disabled: this.data.mode === 'edit' },
      [Validators.required, Validators.email],
    ],
    firstName: [this.data.mode === 'edit' ? (this.data.user.firstName ?? '') : '', Validators.maxLength(100)],
    lastName: [this.data.mode === 'edit' ? (this.data.user.lastName ?? '') : '', Validators.maxLength(100)],
    role: [(this.data.mode === 'edit' ? this.data.user.role : 'user') as Role],
    language: [this.data.mode === 'edit' ? this.data.user.language : this.data.defaultLanguage],
    echocallCustomerId: [
      this.data.mode === 'edit' && this.data.user.echocallCustomerId
        ? String(this.data.user.echocallCustomerId)
        : '',
      integerValidator,
    ],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      const customerId =
        value.role === 'user' && value.echocallCustomerId ? Number(value.echocallCustomerId) : null;
      if (this.data.mode === 'invite') {
        const body: InviteInput = {
          email: value.email,
          role: value.role,
          language: value.language as InviteInput['language'],
          ...(value.firstName ? { firstName: value.firstName } : {}),
          ...(value.lastName ? { lastName: value.lastName } : {}),
          ...(customerId ? { echocallCustomerId: customerId } : {}),
        };
        const result = await firstValueFrom(this.api.post<InviteResult>('/admin/users/invite', body));
        this.ref.close({ mode: 'invite', result });
      } else {
        const body: UserUpdate = {
          firstName: value.firstName || null,
          lastName: value.lastName || null,
          language: value.language as UserUpdate['language'],
          role: value.role,
          echocallCustomerId: customerId,
        };
        const user = await firstValueFrom(
          this.api.patch<AdminUser>(`/admin/users/${this.data.user.id}`, body),
        );
        this.ref.close({ mode: 'edit', user });
      }
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'email_taken') {
        this.form.controls.email.setErrors({ server: error.message });
      } else if (error.code === 'customer_taken') {
        this.form.controls.echocallCustomerId.setErrors({ server: error.message });
      } else if (!applyServerErrors(this.form, error)) {
        this.notify.apiError(err);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
