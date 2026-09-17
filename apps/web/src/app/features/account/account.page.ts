import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormGroupDirective, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { readApiError } from '../../core/errors/api-error';
import { LANGUAGES, type SessionUser } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../shared/forms/server-errors';
import {
  matchValidator,
  PASSWORD_MIN_LENGTH,
  passwordStrengthValidator,
} from '../../shared/forms/validators';
import { BillingPanel } from './billing.panel';
import { TwoFactorPanel } from './two-factor.panel';

/** Profile and password of the signed-in person; available to both roles. */
@Component({
  selector: 'app-account-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTabsModule,
    TranslocoDirective,
    FieldErrorPipe,
    BillingPanel,
    TwoFactorPanel,
  ],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('account.title') }}</h1>
      <mat-tab-group>
        <mat-tab [label]="t('account.tabs.profile')">
          <div class="cards">
            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ t('account.profile.title') }}</mat-card-title>
                <mat-card-subtitle>{{ user()?.email }}</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <form [formGroup]="profile" (ngSubmit)="saveProfile()" novalidate>
                  <div class="row">
                    <mat-form-field appearance="outline">
                      <mat-label>{{ t('fields.firstName') }}</mat-label>
                      <input matInput formControlName="firstName" autocomplete="given-name" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>{{ t('fields.lastName') }}</mat-label>
                      <input matInput formControlName="lastName" autocomplete="family-name" />
                    </mat-form-field>
                  </div>
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('fields.language') }}</mat-label>
                    <mat-select formControlName="language">
                      @for (lang of languages; track lang) {
                        <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <button mat-flat-button type="submit" [disabled]="savingProfile()">
                    {{ t('actions.save') }}
                  </button>
                </form>
              </mat-card-content>
            </mat-card>

            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ t('account.password.title') }}</mat-card-title>
                <mat-card-subtitle>{{ t('account.password.intro') }}</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <form [formGroup]="password" (ngSubmit)="changePassword()" novalidate #passwordForm="ngForm">
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('fields.currentPassword') }}</mat-label>
                    <input
                      matInput
                      type="password"
                      formControlName="currentPassword"
                      autocomplete="current-password"
                    />
                    @if (password.controls.currentPassword | fieldError; as e) {
                      <mat-error>{{ t(e.key, e.params) }}</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('fields.newPassword') }}</mat-label>
                    <input
                      matInput
                      type="password"
                      formControlName="newPassword"
                      autocomplete="new-password"
                    />
                    <mat-hint>{{ t('auth.passwordHint') }}</mat-hint>
                    @if (password.controls.newPassword | fieldError; as e) {
                      <mat-error>{{ t(e.key, e.params) }}</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('fields.confirmPassword') }}</mat-label>
                    <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
                    @if (password.controls.confirm | fieldError; as e) {
                      <mat-error>{{ t(e.key, e.params) }}</mat-error>
                    }
                  </mat-form-field>
                  <button mat-flat-button type="submit" [disabled]="savingPassword()">
                    {{ t('account.password.submit') }}
                  </button>
                </form>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
        <mat-tab [label]="t('account.tabs.security')" data-testid="security-tab">
          <ng-template matTabContent>
            <div class="cards">
              <app-two-factor-panel />
            </div>
          </ng-template>
        </mat-tab>
        @if (showBilling()) {
          <mat-tab [label]="t('account.tabs.billing')" data-testid="billing-tab">
            <ng-template matTabContent>
              <app-billing-panel />
            </ng-template>
          </mat-tab>
        }
      </mat-tab-group>
    </ng-container>
  `,
  styles: `
    mat-tab-group {
      margin-top: 8px;
    }
    .cards {
      padding-top: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
      align-items: start;
    }
    mat-card-content {
      padding-top: 16px;
    }
  `,
})
export class AccountPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly languages = LANGUAGES;
  readonly user = this.auth.user;

  /** Billing belongs to the hub customer, which an operator account does not have. */
  readonly showBilling = computed(() => this.user()?.echocallCustomerId !== null);

  readonly profile = this.fb.group({
    firstName: [this.user()?.firstName ?? '', Validators.maxLength(100)],
    lastName: [this.user()?.lastName ?? '', Validators.maxLength(100)],
    language: [this.user()?.language ?? 'de'],
  });
  readonly password = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), passwordStrengthValidator],
      ],
      confirm: ['', Validators.required],
    },
    { validators: matchValidator('newPassword', 'confirm') },
  );
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);

  async saveProfile(): Promise<void> {
    if (this.profile.invalid) return;
    this.savingProfile.set(true);
    try {
      const { firstName, lastName, language } = this.profile.getRawValue();
      const user = await firstValueFrom(
        this.api.patch<SessionUser>('/account/profile', {
          firstName: firstName || null,
          lastName: lastName || null,
          language,
        }),
      );
      this.auth.setUser(user);
      this.notify.success('account.profile.saved');
    } catch (err) {
      if (!applyServerErrors(this.profile, readApiError(err))) this.notify.apiError(err);
    } finally {
      this.savingProfile.set(false);
    }
  }

  private readonly passwordForm = viewChild.required<FormGroupDirective>('passwordForm');

  async changePassword(): Promise<void> {
    if (this.password.invalid) {
      this.password.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    try {
      const { currentPassword, newPassword } = this.password.getRawValue();
      await firstValueFrom(this.api.post<void>('/account/password', { currentPassword, newPassword }));
      // Resetting through the directive, not the group: the group alone keeps
      // the form marked as submitted, and the emptied fields would come back
      // decorated with "required" the moment the password was accepted.
      this.passwordForm().resetForm();
      this.notify.success('account.password.saved');
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'invalid_current_password') {
        this.password.controls.currentPassword.setErrors({ server: error.message });
        this.password.controls.currentPassword.markAsTouched();
      } else if (!applyServerErrors(this.password, error)) {
        this.notify.apiError(err);
      }
    } finally {
      this.savingPassword.set(false);
    }
  }
}
