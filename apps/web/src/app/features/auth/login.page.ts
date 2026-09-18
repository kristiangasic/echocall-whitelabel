import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { BrandingService } from '../../core/branding/branding.service';
import { readApiError } from '../../core/errors/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { AuthCardComponent } from '../../shared/auth-card.component';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

/**
 * The way in, and the only one: an address, and a link in the post. There is no
 * password anywhere in this portal, so this page asks for one field and says
 * the same thing whether or not the address has an account here.
 */
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
      <h1 class="auth-title">{{ t('auth.link.title') }}</h1>
      @if (linkSent()) {
        <p class="auth-intro" data-testid="link-sent">{{ t('auth.link.done') }}</p>
        <p class="auth-links">
          <button mat-button type="button" (click)="again()" data-testid="send-again">
            {{ t('auth.link.again') }}
          </button>
        </p>
      } @else {
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
      }
      @if (signUpOpen()) {
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
  private readonly branding = inject(BrandingService);
  readonly notify = inject(NotifyService);

  /** The one switch the operator set, read from the public settings. */
  readonly signUpOpen = computed(() => this.branding.registration().selfServiceEnabled);

  readonly linkForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly linkSent = signal(false);

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

  /** For the reader whose link never arrived, or who mistyped the address. */
  again(): void {
    this.linkSent.set(false);
    this.error.set(null);
  }
}
