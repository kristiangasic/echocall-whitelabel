import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { readApiError } from '../../core/errors/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { FieldErrorPipe } from '../../shared/forms/field-error.pipe';

/** What the portal hands out once, while a second factor is being enrolled. */
interface Enrolment {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

const CODE_LENGTH = 6;

/**
 * The second factor of one's own login: enrolling it, confirming it with a
 * code from the app, reading the recovery codes once, and removing it again.
 * There is no password in this portal, so the factor itself is what proves
 * that whoever switches it off is the one who set it up.
 */
@Component({
  selector: 'app-two-factor-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  template: `
    <mat-card appearance="outlined" *transloco="let t">
      <mat-card-header>
        <mat-card-title>{{ t('account.twoFactor.title') }}</mat-card-title>
        <mat-card-subtitle>{{ t('account.twoFactor.intro') }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (recoveryCodes(); as codes) {
          <h2 class="section">{{ t('account.twoFactor.recoveryTitle') }}</h2>
          <p class="hint">{{ t('account.twoFactor.recoveryIntro') }}</p>
          <ul class="codes" data-testid="recovery-codes">
            @for (code of codes; track code) {
              <li>{{ code }}</li>
            }
          </ul>
          <button mat-flat-button type="button" (click)="dismissCodes()" data-testid="recovery-done">
            {{ t('account.twoFactor.recoveryDone') }}
          </button>
        } @else if (enrolment(); as setup) {
          <p class="hint">{{ t('account.twoFactor.scan') }}</p>
          <div class="qr" data-testid="two-factor-qr" [innerHTML]="qr()"></div>
          <p class="hint">{{ t('account.twoFactor.manual') }}</p>
          <p class="secret" data-testid="two-factor-secret">{{ setup.secret }}</p>
          <form [formGroup]="activation" (ngSubmit)="activate()" novalidate>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ t('account.twoFactor.code') }}</mat-label>
              <input
                matInput
                formControlName="code"
                autocomplete="one-time-code"
                inputmode="numeric"
                autocapitalize="off"
                spellcheck="false"
                data-testid="activation-code"
              />
              @if (activation.controls.code | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
            <div class="actions">
              <button mat-button type="button" (click)="cancel()" data-testid="two-factor-cancel">
                {{ t('actions.cancel') }}
              </button>
              <button mat-flat-button type="submit" [disabled]="busy()" data-testid="two-factor-activate">
                {{ t('account.twoFactor.activate') }}
              </button>
            </div>
          </form>
        } @else if (enabled()) {
          <p class="status" data-testid="two-factor-status">{{ t('account.twoFactor.statusOn') }}</p>
          <h2 class="section">{{ t('account.twoFactor.disableTitle') }}</h2>
          <p class="hint">{{ t('account.twoFactor.disableIntro') }}</p>
          <form [formGroup]="removal" (ngSubmit)="disable()" novalidate>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ t('account.twoFactor.code') }}</mat-label>
              <input
                matInput
                formControlName="code"
                autocomplete="one-time-code"
                inputmode="numeric"
                autocapitalize="off"
                spellcheck="false"
                data-testid="disable-code"
              />
              @if (removal.controls.code | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
            <button mat-stroked-button type="submit" [disabled]="busy()" data-testid="two-factor-disable">
              {{ t('account.twoFactor.disable') }}
            </button>
          </form>
        } @else {
          <p class="status" data-testid="two-factor-status">{{ t('account.twoFactor.statusOff') }}</p>
          <button
            mat-flat-button
            type="button"
            (click)="start()"
            [disabled]="busy()"
            data-testid="two-factor-start"
          >
            {{ t('account.twoFactor.start') }}
          </button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    mat-card-content {
      padding-top: 16px;
    }
    .section {
      font: var(--mat-sys-title-medium);
      margin: 0 0 4px;
    }
    .hint,
    .status {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
      margin: 0 0 16px;
    }
    .qr {
      max-width: 220px;
      margin-bottom: 16px;
    }
    .qr ::ng-deep svg {
      width: 100%;
      height: auto;
      display: block;
      background: #fff;
      border-radius: 8px;
    }
    .secret {
      font-family: ui-monospace, 'SFMono-Regular', 'Consolas', monospace;
      letter-spacing: 0.08em;
      overflow-wrap: anywhere;
      margin: 0 0 16px;
    }
    .codes {
      list-style: none;
      padding: 0;
      margin: 0 0 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
      font-family: ui-monospace, 'SFMono-Regular', 'Consolas', monospace;
      letter-spacing: 0.08em;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `,
})
export class TwoFactorPanel {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotifyService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly enabled = computed(() => this.auth.user()?.twoFactorEnabled === true);
  readonly enrolment = signal<Enrolment | null>(null);
  readonly recoveryCodes = signal<string[] | null>(null);
  readonly busy = signal(false);

  readonly activation = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(CODE_LENGTH)]],
  });
  readonly removal = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(CODE_LENGTH)]],
  });

  /**
   * The drawing comes from the portal's own API, which renders it from the
   * enrolment URL it just built. Angular's sanitiser drops SVG out of bound
   * markup, so the value is marked as trusted here rather than server side.
   */
  readonly qr = computed<SafeHtml | null>(() => {
    const setup = this.enrolment();
    return setup ? this.sanitizer.bypassSecurityTrustHtml(setup.qrSvg) : null;
  });

  async start(): Promise<void> {
    this.busy.set(true);
    try {
      this.enrolment.set(await firstValueFrom(this.api.post<Enrolment>('/auth/2fa/setup')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.enrolment.set(null);
    this.activation.reset();
  }

  async activate(): Promise<void> {
    if (this.activation.invalid) {
      this.activation.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { recoveryCodes } = await firstValueFrom(
        this.api.post<{ recoveryCodes: string[] }>('/auth/2fa/activate', this.activation.getRawValue()),
      );
      this.enrolment.set(null);
      this.activation.reset();
      this.recoveryCodes.set(recoveryCodes);
      this.markEnabled(true);
      this.notify.success('account.twoFactor.activated');
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'invalid_code') {
        this.activation.controls.code.setErrors({ server: error.message });
        this.activation.controls.code.markAsTouched();
      } else {
        this.notify.apiError(err);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** The codes are shown once; acknowledging them is what closes them. */
  dismissCodes(): void {
    this.recoveryCodes.set(null);
  }

  async disable(): Promise<void> {
    if (this.removal.invalid) {
      this.removal.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete<void>('/auth/2fa', this.removal.getRawValue()));
      this.removal.reset();
      this.markEnabled(false);
      this.notify.success('account.twoFactor.disabled');
    } catch (err) {
      const error = readApiError(err);
      if (error.code === 'invalid_code') {
        this.removal.controls.code.setErrors({ server: error.message });
        this.removal.controls.code.markAsTouched();
      } else {
        this.notify.apiError(err);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private markEnabled(twoFactorEnabled: boolean): void {
    const user = this.auth.user();
    if (user) this.auth.setUser({ ...user, twoFactorEnabled });
  }
}
