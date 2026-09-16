import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { BrandingService } from '../../core/branding/branding.service';
import { readApiError } from '../../core/errors/api-error';
import { type HubStatus, LANGUAGES, type SessionUser, type SetupStatus } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../shared/forms/server-errors';
import { matchValidator, PASSWORD_MIN_LENGTH } from '../../shared/forms/validators';
import { LocalDatePipe } from '../../shared/local-date.pipe';

@Component({
  selector: 'app-setup-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    AuthCardComponent,
    FieldErrorPipe,
    LocalDatePipe,
  ],
  template: `
    <app-auth-card *transloco="let t">
      <h1 class="auth-title">{{ t('setup.title') }}</h1>
      <p>{{ t('setup.intro') }}</p>

      <section class="step">
        <h2 class="step-title">{{ t('setup.connection.title') }}</h2>
        @if (!status() && !loadError()) {
          <mat-progress-bar mode="indeterminate" />
        } @else if (loadError()) {
          <p class="status status-bad" role="alert">
            <mat-icon>error</mat-icon>
            <span>{{ t('errors.network') }}</span>
          </p>
          <button mat-stroked-button type="button" (click)="load()">{{ t('actions.retry') }}</button>
        } @else if (status()?.hub; as hub) {
          @if (hub.ok) {
            <p class="status status-ok" data-testid="hub-ok">
              <mat-icon>check_circle</mat-icon>
              <span>{{ t('setup.connection.ok', { email: hub.email ?? '' }) }}</span>
            </p>
          } @else {
            <p class="status status-bad" role="alert" data-testid="hub-failed">
              <mat-icon>error</mat-icon>
              <span>
                {{ t('setup.connection.failed') }}: {{ t(notify.errorKey(hub.error?.code ?? 'unknown')) }}
              </span>
            </p>
            <p class="hint">{{ t('setup.connection.hint') }}</p>
          }
          <p class="hint">
            @if (hub.checkedAt) {
              {{ t('setup.connection.checkedAt', { time: hub.checkedAt | localDate }) }}
            } @else {
              {{ t('setup.connection.unchecked') }}
            }
          </p>
          <button mat-stroked-button type="button" (click)="recheck()" [disabled]="checking()">
            <mat-icon>refresh</mat-icon>
            {{ t('actions.retry') }}
          </button>
        }
      </section>

      <section class="step">
        <h2 class="step-title">{{ t('setup.admin.title') }}</h2>
        <p>{{ t('setup.admin.intro') }}</p>
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
            <mat-label>{{ t('fields.email') }}</mat-label>
            <input
              matInput
              type="email"
              formControlName="email"
              autocomplete="username"
              data-testid="email"
            />
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
              autocomplete="new-password"
              data-testid="password"
            />
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
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.language') }}</mat-label>
            <mat-select formControlName="language">
              @for (lang of languages; track lang) {
                <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="submit">
            {{ t('setup.admin.submit') }}
          </button>
        </form>
      </section>
    </app-auth-card>
  `,
  styles: `
    .step {
      margin-top: 24px;
    }
    .step-title {
      font: var(--mat-sys-title-medium);
      margin: 0 0 8px;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
    }
    .status-ok {
      color: var(--mat-sys-primary);
    }
    .status-bad {
      color: var(--mat-sys-error);
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 8px;
    }
  `,
})
export class SetupPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly branding = inject(BrandingService);
  private readonly router = inject(Router);
  readonly notify = inject(NotifyService);
  readonly languages = LANGUAGES;

  readonly status = signal<SetupStatus | null>(null);
  readonly loadError = signal(false);
  readonly checking = signal(false);
  readonly busy = signal(false);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      firstName: ['', Validators.maxLength(100)],
      lastName: ['', Validators.maxLength(100)],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
      confirm: ['', Validators.required],
      language: [this.branding.branding().defaultLanguage],
    },
    { validators: matchValidator('password', 'confirm') },
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(false);
    try {
      const status = await firstValueFrom(this.api.get<SetupStatus>('/setup/status'));
      this.status.set(status);
      this.branding.update(status.branding);
    } catch {
      this.loadError.set(true);
    }
  }

  async recheck(): Promise<void> {
    this.checking.set(true);
    try {
      const hub = await firstValueFrom(this.api.post<HubStatus>('/setup/hub-check'));
      this.status.update((current) => (current ? { ...current, hub } : current));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.checking.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { firstName, lastName, email, password, language } = this.form.getRawValue();
      const user = await firstValueFrom(
        this.api.post<SessionUser>('/setup/admin', { firstName, lastName, email, password, language }),
      );
      this.auth.setUser(user);
      this.notify.success('setup.completed');
      await this.router.navigateByUrl('/admin');
    } catch (err) {
      const error = readApiError(err);
      if (!applyServerErrors(this.form, error)) this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
