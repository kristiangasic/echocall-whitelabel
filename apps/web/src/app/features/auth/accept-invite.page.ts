import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { homePath } from '../../core/auth/role.guard';
import { readApiError } from '../../core/errors/api-error';
import type { SessionUser } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';
import {
  matchValidator,
  PASSWORD_MIN_LENGTH,
  passwordStrengthValidator,
} from '../../shared/forms/validators';

@Component({
  selector: 'app-accept-invite-page',
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
      <h1 class="auth-title">{{ t('auth.invite.title') }}</h1>
      @if (!token() || invalidToken()) {
        <p role="alert">{{ t('auth.invite.invalid') }}</p>
        <p class="auth-links">
          <a routerLink="/login">{{ t('auth.forgot.toLogin') }}</a>
        </p>
      } @else {
        <p>{{ t('auth.invite.intro') }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
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
            <mat-label>{{ t('fields.password') }}</mat-label>
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
          <button mat-flat-button type="submit" class="full" [disabled]="busy()">
            {{ t('auth.invite.submit') }}
          </button>
        </form>
      }
    </app-auth-card>
  `,
})
export class AcceptInvitePage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** Bound from the ?token= query parameter of the invitation link. */
  readonly token = input<string>();

  readonly form = inject(NonNullableFormBuilder).group(
    {
      firstName: ['', Validators.maxLength(100)],
      lastName: ['', Validators.maxLength(100)],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), passwordStrengthValidator],
      ],
      confirm: ['', Validators.required],
    },
    { validators: matchValidator('password', 'confirm') },
  );
  readonly busy = signal(false);
  readonly invalidToken = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { firstName, lastName, password } = this.form.getRawValue();
      const user = await firstValueFrom(
        this.api.post<SessionUser>('/auth/accept-invite', {
          token: this.token(),
          password,
          firstName,
          lastName,
        }),
      );
      this.auth.setUser(user);
      await this.router.navigateByUrl(homePath(user.role));
    } catch (err) {
      if (readApiError(err).code === 'invalid_token') this.invalidToken.set(true);
      else this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
