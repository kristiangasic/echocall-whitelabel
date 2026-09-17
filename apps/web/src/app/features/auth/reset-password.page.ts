import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { readApiError } from '../../core/errors/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';
import {
  matchValidator,
  PASSWORD_MIN_LENGTH,
  passwordStrengthValidator,
} from '../../shared/forms/validators';

@Component({
  selector: 'app-reset-password-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    RouterLink,
    TranslocoDirective,
    AuthCardComponent,
    FieldErrorPipe,
  ],
  template: `
    <app-auth-card *transloco="let t">
      <h1 class="auth-title">{{ t('auth.reset.title') }}</h1>
      @if (!token()) {
        <p role="alert">{{ t('auth.reset.invalid') }}</p>
        <p class="auth-links">
          <a routerLink="/forgot-password">{{ t('auth.login.forgot') }}</a>
        </p>
      } @else if (done()) {
        <p data-testid="done">{{ t('auth.reset.done') }}</p>
        <p class="auth-links">
          <a routerLink="/login">{{ t('auth.forgot.toLogin') }}</a>
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.newPassword') }}</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="new-password" />
            <mat-hint>{{ t('auth.passwordHint') }}</mat-hint>
            @if (form.controls.password | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.confirmPassword') }}</mat-label>
            <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
            @if (form.controls.confirm | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          @if (invalidToken()) {
            <p class="form-error" role="alert">{{ t('auth.reset.invalid') }}</p>
          }
          <button mat-flat-button type="submit" class="full" [disabled]="busy()">
            {{ t('auth.reset.submit') }}
          </button>
        </form>
      }
    </app-auth-card>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  /** Bound from the ?token= query parameter of the link in the mail. */
  readonly token = input<string>();

  readonly form = inject(NonNullableFormBuilder).group(
    {
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), passwordStrengthValidator],
      ],
      confirm: ['', Validators.required],
    },
    { validators: matchValidator('password', 'confirm') },
  );
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly invalidToken = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.invalidToken.set(false);
    try {
      await firstValueFrom(
        this.api.post<void>('/auth/reset', {
          token: this.token(),
          password: this.form.getRawValue().password,
        }),
      );
      this.done.set(true);
    } catch (err) {
      if (readApiError(err).code === 'invalid_token') this.invalidToken.set(true);
      else this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
