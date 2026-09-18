import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { BrandingService } from '../../core/branding/branding.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

/**
 * Self-service sign-up. Whether the address was free, already taken or refused
 * by the service, the visitor sees the same answer, so the form says nothing
 * about who has an account here.
 */
@Component({
  selector: 'app-register-page',
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
      <h1 class="auth-title">{{ t('auth.register.title') }}</h1>
      @if (!open()) {
        <p role="alert" data-testid="closed">{{ t('auth.register.closed') }}</p>
      } @else if (done()) {
        <p data-testid="done">{{ t('auth.register.done') }}</p>
      } @else {
        <p class="auth-intro">{{ t('auth.register.intro') }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.email') }}</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" data-testid="email" />
            @if (form.controls.email | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.firstName') }}</mat-label>
              <input matInput formControlName="firstName" autocomplete="given-name" />
              @if (form.controls.firstName | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.lastName') }}</mat-label>
              <input matInput formControlName="lastName" autocomplete="family-name" />
              @if (form.controls.lastName | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.company') }}</mat-label>
            <input matInput formControlName="company" autocomplete="organization" />
            @if (form.controls.company | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="submit">
            {{ t('auth.register.submit') }}
          </button>
        </form>
      }
      <p class="auth-links">
        <a routerLink="/login">{{ t('auth.register.toLogin') }}</a>
      </p>
    </app-auth-card>
  `,
  styles: `
    .auth-intro {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
      margin: 0 0 16px;
    }
  `,
})
export class RegisterPage {
  private readonly api = inject(ApiService);
  private readonly branding = inject(BrandingService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotifyService);

  readonly open = computed(() => this.branding.registration().selfServiceEnabled);
  readonly busy = signal(false);
  readonly done = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    firstName: ['', Validators.maxLength(100)],
    lastName: ['', Validators.maxLength(100)],
    company: ['', Validators.maxLength(200)],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      await firstValueFrom(
        this.api.post<{ accepted: true }>('/auth/register', {
          email: value.email.trim(),
          firstName: value.firstName.trim() || undefined,
          lastName: value.lastName.trim() || undefined,
          company: value.company.trim() || undefined,
          // The account keeps the language the visitor is reading this page in.
          language: this.language.current(),
        }),
      );
      this.done.set(true);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
