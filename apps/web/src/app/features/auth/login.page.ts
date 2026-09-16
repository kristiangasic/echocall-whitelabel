import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { homePath } from '../../core/auth/role.guard';
import { readApiError } from '../../core/errors/api-error';
import type { Role } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

@Component({
  selector: 'app-login-page',
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
      <h1 class="auth-title">{{ t('auth.login.title') }}</h1>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ t('fields.email') }}</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="username" data-testid="email" />
          @if (form.controls.email | fieldError; as e) {
            <mat-error>{{ t(e.key, e.params) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ t('fields.password') }}</mat-label>
          <input
            matInput
            type="password"
            formControlName="password"
            autocomplete="current-password"
            data-testid="password"
          />
          @if (form.controls.password | fieldError; as e) {
            <mat-error>{{ t(e.key, e.params) }}</mat-error>
          }
        </mat-form-field>
        @if (error(); as code) {
          <p class="form-error" role="alert" data-testid="login-error">{{ t(notify.errorKey(code)) }}</p>
        }
        <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="submit">
          {{ t('auth.login.submit') }}
        </button>
      </form>
      <p class="auth-links">
        <a routerLink="/forgot-password">{{ t('auth.login.forgot') }}</a>
      </p>
    </app-auth-card>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly notify = inject(NotifyService);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const user = await this.auth.login(email, password);
      await this.router.navigateByUrl(this.target(user.role));
    } catch (err) {
      this.error.set(readApiError(err).code);
    } finally {
      this.busy.set(false);
    }
  }

  /** Only same-origin paths are honoured, so a crafted link cannot send the user elsewhere. */
  private target(role: Role): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : homePath(role);
  }
}
