import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { FormGroupDirective, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { homePath } from '../../core/auth/role.guard';
import { readApiError } from '../../core/errors/api-error';
import type { Role, TwoFactorChallenge } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

/**
 * The other end of a mailed sign-in link. The token is spent as soon as the
 * page opens; an account with a second factor still answers that here.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
    AuthCardComponent,
    FieldErrorPipe,
  ],
  template: `
    <app-auth-card *transloco="let t">
      <h1 class="auth-title">{{ t(challenge() ? 'auth.twoFactor.title' : 'auth.signIn.title') }}</h1>
      @if (challenge()) {
        <p class="auth-intro">{{ t('auth.twoFactor.intro') }}</p>
        <form [formGroup]="codeForm" #codeFormDir="ngForm" (ngSubmit)="submitCode(codeFormDir)" novalidate>
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
            <p class="form-error" role="alert">{{ t(notify.errorKey(code)) }}</p>
          }
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="verify">
            {{ t('auth.twoFactor.submit') }}
          </button>
        </form>
        <p class="auth-links">
          <span class="hint">{{ t('auth.twoFactor.recoveryHint') }}</span>
        </p>
      } @else if (failed()) {
        <p role="alert" data-testid="link-invalid">{{ t('auth.signIn.invalid') }}</p>
        <p class="auth-links">
          <a routerLink="/login">{{ t('auth.signIn.toLogin') }}</a>
        </p>
      } @else {
        <p class="auth-intro" data-testid="working">{{ t('auth.signIn.working') }}</p>
        <mat-progress-bar mode="indeterminate" />
      }
    </app-auth-card>
  `,
  styles: `
    .auth-intro,
    .hint {
      font: var(--mat-sys-body-medium);
    }
    .auth-intro {
      margin: 0 0 16px;
    }
  `,
})
export class SignInPage implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly notify = inject(NotifyService);

  /** Bound from the ?token= query parameter of the mailed link. */
  readonly token = input<string>();

  readonly codeForm = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly error = signal<string | null>(null);
  readonly challenge = signal<TwoFactorChallenge | null>(null);

  ngOnInit(): void {
    void this.consume();
  }

  private async consume(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.failed.set(true);
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.auth.consumeSignInLink(token);
      if (result.kind === 'challenge') {
        this.challenge.set(result.challenge);
        return;
      }
      await this.router.navigateByUrl(homePath(result.user.role));
    } catch {
      // Every refusal reads the same to the visitor: the link no longer works.
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async submitCode(form: FormGroupDirective): Promise<void> {
    const challenge = this.challenge();
    if (!challenge || this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.verifyTwoFactor(challenge.challenge, this.codeForm.getRawValue().code);
      await this.router.navigateByUrl(homePath(user.role as Role));
    } catch (err) {
      const code = readApiError(err).code;
      this.error.set(code);
      // A spent challenge cannot be retried, and the link behind it is gone
      // too, so the visitor is sent back to ask for a new one.
      if (code === 'invalid_challenge') {
        this.challenge.set(null);
        this.failed.set(true);
      }
      // The field is emptied for the next try. Emptying it through the form
      // itself also clears the submitted mark, so the now empty field does not
      // report itself as missing beside the answer the visitor came for.
      form.resetForm();
    } finally {
      this.busy.set(false);
    }
  }
}
