import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

@Component({
  selector: 'app-forgot-password-page',
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
      <h1 class="auth-title">{{ t('auth.forgot.title') }}</h1>
      @if (done()) {
        <p data-testid="done">{{ t('auth.forgot.done') }}</p>
      } @else {
        <p>{{ t('auth.forgot.intro') }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.email') }}</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="username" />
            @if (form.controls.email | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <button mat-flat-button type="submit" class="full" [disabled]="busy()">
            {{ t('auth.forgot.submit') }}
          </button>
        </form>
      }
      <p class="auth-links">
        <a routerLink="/login">{{ t('auth.forgot.toLogin') }}</a>
      </p>
    </app-auth-card>
  `,
})
export class ForgotPasswordPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly busy = signal(false);
  readonly done = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post<void>('/auth/forgot', this.form.getRawValue()));
      this.done.set(true);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
