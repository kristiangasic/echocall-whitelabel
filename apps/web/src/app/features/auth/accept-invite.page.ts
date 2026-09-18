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

/**
 * What an invitation leads to. There is nothing to choose here beyond a name:
 * the link in the mail is what proved the address, and every sign-in after
 * this one arrives the same way.
 */
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
  ],
  template: `
    <app-auth-card *transloco="let t">
      <h1 class="auth-title">{{ t('auth.invite.title') }}</h1>
      @if (!token() || invalidToken()) {
        <p role="alert">{{ t('auth.invite.invalid') }}</p>
        <p class="auth-links">
          <a routerLink="/login">{{ t('auth.signIn.toLogin') }}</a>
        </p>
      } @else {
        <p class="auth-intro">{{ t('auth.invite.intro') }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.firstName') }}</mat-label>
              <input
                matInput
                formControlName="firstName"
                autocomplete="given-name"
                data-testid="first-name"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.lastName') }}</mat-label>
              <input matInput formControlName="lastName" autocomplete="family-name" data-testid="last-name" />
            </mat-form-field>
          </div>
          <button mat-flat-button type="submit" class="full" [disabled]="busy()" data-testid="submit">
            {{ t('auth.invite.submit') }}
          </button>
        </form>
      }
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
export class AcceptInvitePage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** Bound from the ?token= query parameter of the invitation link. */
  readonly token = input<string>();

  readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', Validators.maxLength(100)],
    lastName: ['', Validators.maxLength(100)],
  });
  readonly busy = signal(false);
  readonly invalidToken = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { firstName, lastName } = this.form.getRawValue();
      const user = await firstValueFrom(
        this.api.post<SessionUser>('/auth/accept-invite', { token: this.token(), firstName, lastName }),
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
