import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { homePath } from '../../core/auth/role.guard';
import { BrandingService } from '../../core/branding/branding.service';
import { readApiError } from '../../core/errors/api-error';
import type { Role, TwoFactorChallenge } from '../../core/models';
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
      <h1 class="auth-title">{{ t(title()) }}</h1>
      @if (challenge()) {
        <p class="auth-intro">{{ t('auth.twoFactor.intro') }}</p>
        <form [formGroup]="codeForm" (ngSubmit)="submitCode()" novalidate>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('auth.twoFactor.code') }}</mat-label>
            <input
              matInput
              formControlName="code"
              autocomplete="one-time-code"
              inputmode="numeric"
              autocapitalize="off"
              spellcheck="false"
              data-testid="code"
            />
            @if (codeForm.controls.code | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          @if (error(); as code) {
            <p class="form-error" role="alert" data-testid="login-error">{{ t(notify.errorKey(code)) }}</p>
          }
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="verify">
            {{ t('auth.twoFactor.submit') }}
          </button>
        </form>
        <p class="auth-links">
          <span class="hint">{{ t('auth.twoFactor.recoveryHint') }}</span>
        </p>
      } @else if (linkSent()) {
        <p class="auth-intro" data-testid="link-sent">{{ t('auth.link.done') }}</p>
        <p class="auth-links">
          <a routerLink="/login" (click)="backToPassword()">{{ t('auth.signIn.toLogin') }}</a>
        </p>
      } @else if (mode() === 'link') {
        <p class="auth-intro">{{ t('auth.link.intro') }}</p>
        <form [formGroup]="linkForm" (ngSubmit)="submitLink()" novalidate>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.email') }}</mat-label>
            <input
              matInput
              type="email"
              formControlName="email"
              autocomplete="username"
              data-testid="link-email"
            />
            @if (linkForm.controls.email | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          @if (error(); as code) {
            <p class="form-error" role="alert" data-testid="login-error">{{ t(notify.errorKey(code)) }}</p>
          }
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="send-link">
            {{ t('auth.link.submit') }}
          </button>
        </form>
        <p class="auth-links">
          <button mat-button type="button" (click)="mode.set('password')" data-testid="use-password">
            {{ t('auth.login.passwordTab') }}
          </button>
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
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
          @if (linksEnabled()) {
            <button mat-button type="button" (click)="mode.set('link')" data-testid="use-link">
              {{ t('auth.login.linkTab') }}
            </button>
          }
        </p>
      }
      @if (signUpOpen() && !challenge()) {
        <p class="auth-links sign-up">
          <span class="hint">{{ t('auth.login.noAccount') }}</span>
          <a routerLink="/register" data-testid="to-register">{{ t('auth.login.register') }}</a>
        </p>
      }
    </app-auth-card>
  `,
  styles: `
    .auth-intro,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .auth-intro {
      margin: 0 0 16px;
    }
    .sign-up {
      display: flex;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly branding = inject(BrandingService);
  readonly notify = inject(NotifyService);

  /** The two switches the operator set, read from the public settings. */
  readonly linksEnabled = computed(() => this.branding.registration().signInLinksEnabled);
  readonly signUpOpen = computed(() => this.branding.registration().selfServiceEnabled);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly linkForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly codeForm = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /**
   * Where a portal that offers both starts. A mailed link asks for one field
   * instead of two, so it leads while the operator has it switched on.
   */
  readonly mode = signal<'password' | 'link'>(this.linksEnabled() ? 'link' : 'password');
  readonly linkSent = signal(false);
  /** Set once the password was accepted and the account asked for a second factor. */
  readonly challenge = signal<TwoFactorChallenge | null>(null);

  readonly title = computed(() => {
    if (this.challenge()) return 'auth.twoFactor.title';
    return this.mode() === 'link' && !this.linkSent() ? 'auth.link.title' : 'auth.login.title';
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const result = await this.auth.login(email, password);
      if (result.kind === 'challenge') {
        this.challenge.set(result.challenge);
        return;
      }
      await this.router.navigateByUrl(this.target(result.user.role));
    } catch (err) {
      this.error.set(readApiError(err).code);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Asks for a one-time link. The answer is the same for an address with an
   * account and one without, so the page says only that a link is on its way.
   */
  async submitLink(): Promise<void> {
    if (this.linkForm.invalid) {
      this.linkForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.requestSignInLink(this.linkForm.getRawValue().email);
      this.linkSent.set(true);
    } catch (err) {
      this.error.set(readApiError(err).code);
    } finally {
      this.busy.set(false);
    }
  }

  backToPassword(): void {
    this.linkSent.set(false);
    this.error.set(null);
    this.mode.set('password');
  }

  /** The second step: the code from the app, or one of the recovery codes. */
  async submitCode(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge || this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.verifyTwoFactor(challenge.challenge, this.codeForm.getRawValue().code);
      await this.router.navigateByUrl(this.target(user.role));
    } catch (err) {
      const code = readApiError(err).code;
      this.error.set(code);
      // A spent or expired challenge cannot be retried; the password step
      // starts again rather than leaving a field that can never work.
      if (code === 'invalid_challenge') {
        this.challenge.set(null);
        this.form.controls.password.reset();
      }
      this.codeForm.controls.code.reset();
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
