import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { phoneNumberValidator } from '../../../shared/forms/validators';

/** The two ways a number can reach the platform. */
const PROVIDERS = ['sip_trunk', 'twilio'] as const;

/** The transports a trunk can be reached over; `auto` lets the platform decide. */
const TRANSPORTS = ['auto', 'udp', 'tcp', 'tls'] as const;

/** How the media stream is protected. */
const ENCRYPTIONS = ['disabled', 'allowed', 'required'] as const;

/** The controls that hold a credential; they are emptied once the import went through. */
const SECRET_CONTROLS = ['outboundPassword', 'inboundPassword', 'token', 'apiKeySecret'] as const;

/** What the dialog reports back, so the page can name the number it took over. */
export interface ImportNumberResult {
  phoneNumber: string;
}

/**
 * Takes over a number the operator already holds with their own carrier. The
 * credentials typed here are handed to telephony and never come back: the hub
 * does not return them on any read, and the form empties them once the import
 * went through, so a secret is not left sitting in an open dialog.
 */
@Component({
  selector: 'app-import-number-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('admin.numbers.importDialog.title') }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">{{ t('admin.numbers.importDialog.intro') }}</p>
          <div class="row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ t('admin.numbers.importDialog.number') }}</mat-label>
              <input matInput formControlName="phoneNumber" data-testid="number" />
              @if (form.controls.phoneNumber | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              } @else {
                <mat-hint>{{ t('admin.numbers.importDialog.numberHint') }}</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.numbers.importDialog.label') }}</mat-label>
              <input matInput formControlName="label" data-testid="label" />
              @if (form.controls.label | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
          </div>
          <fieldset>
            <legend>{{ t('admin.numbers.importDialog.directions') }}</legend>
            <mat-checkbox formControlName="supportsInbound">
              {{ t('admin.numbers.importDialog.inbound') }}
            </mat-checkbox>
            <mat-checkbox formControlName="supportsOutbound">
              {{ t('admin.numbers.importDialog.outbound') }}
            </mat-checkbox>
          </fieldset>
          <fieldset>
            <legend>{{ t('admin.numbers.importDialog.provider') }}</legend>
            <mat-radio-group formControlName="provider" data-testid="provider">
              @for (provider of providers; track provider) {
                <mat-radio-button [value]="provider">
                  {{ t('admin.numbers.importDialog.providers.' + provider) }}
                </mat-radio-button>
              }
            </mat-radio-group>
          </fieldset>

          @if (form.controls.provider.value === 'sip_trunk') {
            <h3 class="section">{{ t('admin.numbers.importDialog.sip.title') }}</h3>
            <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
              <mat-label>{{ t('admin.numbers.importDialog.sip.address') }}</mat-label>
              <input matInput formControlName="address" data-testid="address" />
              <mat-hint>{{ t('admin.numbers.importDialog.sip.addressHint') }}</mat-hint>
            </mat-form-field>
            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.transport') }}</mat-label>
                <mat-select formControlName="transport">
                  @for (transport of transports; track transport) {
                    <mat-option [value]="transport">{{ transport }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.encryption') }}</mat-label>
                <mat-select formControlName="mediaEncryption">
                  @for (encryption of encryptions; track encryption) {
                    <mat-option [value]="encryption">
                      {{ t('admin.numbers.importDialog.sip.encryptions.' + encryption) }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.outboundUser') }}</mat-label>
                <input matInput formControlName="outboundUsername" autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.outboundPassword') }}</mat-label>
                <input matInput type="password" formControlName="outboundPassword" autocomplete="off" />
              </mat-form-field>
            </div>
            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.inboundUser') }}</mat-label>
                <input matInput formControlName="inboundUsername" autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.sip.inboundPassword') }}</mat-label>
                <input matInput type="password" formControlName="inboundPassword" autocomplete="off" />
              </mat-form-field>
            </div>
            <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
              <mat-label>{{ t('admin.numbers.importDialog.sip.allowedAddresses') }}</mat-label>
              <input matInput formControlName="allowedAddresses" />
              <mat-hint>{{ t('admin.numbers.importDialog.sip.allowedAddressesHint') }}</mat-hint>
            </mat-form-field>
          } @else {
            <h3 class="section">{{ t('admin.numbers.importDialog.carrier.title') }}</h3>
            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.carrier.sid') }}</mat-label>
                <input matInput formControlName="sid" autocomplete="off" data-testid="sid" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.carrier.token') }}</mat-label>
                <input matInput type="password" formControlName="token" autocomplete="off" />
              </mat-form-field>
            </div>
            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.carrier.apiKeySid') }}</mat-label>
                <input matInput formControlName="apiKeySid" autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.numbers.importDialog.carrier.apiKeySecret') }}</mat-label>
                <input matInput type="password" formControlName="apiKeySecret" autocomplete="off" />
              </mat-form-field>
            </div>
            <p class="hint small">{{ t('admin.numbers.importDialog.carrier.optional') }}</p>
          }
          <p class="hint small">{{ t('admin.numbers.importDialog.secretHint') }}</p>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t('admin.numbers.importDialog.submit') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(620px, 90vw);
      padding-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row mat-form-field {
      flex: 1 1 200px;
    }
    fieldset {
      border: 0;
      margin: 0 0 16px;
      padding: 0;
    }
    legend {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
      padding: 0 0 8px;
    }
    fieldset mat-checkbox,
    fieldset mat-radio-group {
      display: flex;
      flex-direction: column;
    }
    .section {
      font: var(--mat-sys-title-small);
      margin: 8px 0 12px;
    }
  `,
})
export class ImportNumberDialogComponent {
  private readonly ref = inject<MatDialogRef<ImportNumberDialogComponent, ImportNumberResult>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);

  readonly providers = PROVIDERS;
  readonly transports = TRANSPORTS;
  readonly encryptions = ENCRYPTIONS;
  readonly busy = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    phoneNumber: ['', [Validators.required, phoneNumberValidator]],
    label: ['', Validators.required],
    supportsInbound: [true],
    supportsOutbound: [true],
    provider: ['sip_trunk' as (typeof PROVIDERS)[number], Validators.required],
    address: [''],
    transport: ['auto' as (typeof TRANSPORTS)[number]],
    mediaEncryption: ['allowed' as (typeof ENCRYPTIONS)[number]],
    outboundUsername: [''],
    outboundPassword: [''],
    inboundUsername: [''],
    inboundPassword: [''],
    allowedAddresses: [''],
    sid: [''],
    token: [''],
    apiKeySid: [''],
    apiKeySecret: [''],
  });

  async submit(): Promise<void> {
    if (!this.valid()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      await firstValueFrom(this.hub.post('/resellers/phone-numbers/import', this.body()));
      this.forgetSecrets();
      this.ref.close({ phoneNumber: value.phoneNumber });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The number and the label are always needed, and each connection has the one
   * field without which it cannot be reached: the trunk its address, the
   * carrier account its identifier and token.
   */
  private valid(): boolean {
    if (this.form.invalid) return false;
    const value = this.form.getRawValue();
    if (value.provider === 'sip_trunk') return value.address.trim().length > 0;
    return value.sid.trim().length > 0 && value.token.length > 0;
  }

  /** Sends only the block that belongs to the chosen connection, and only filled fields. */
  private body(): Record<string, unknown> {
    const value = this.form.getRawValue();
    const base = {
      phoneNumber: value.phoneNumber.trim(),
      label: value.label.trim(),
      supportsInbound: value.supportsInbound,
      supportsOutbound: value.supportsOutbound,
      provider: value.provider,
    };
    if (value.provider !== 'sip_trunk') {
      return {
        ...base,
        twilio: {
          sid: value.sid.trim(),
          token: value.token,
          ...(value.apiKeySid.trim() ? { apiKeySid: value.apiKeySid.trim() } : {}),
          ...(value.apiKeySecret ? { apiKeySecret: value.apiKeySecret } : {}),
        },
      };
    }
    const allowed = value.allowedAddresses
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const inbound = {
      ...(value.inboundUsername.trim() ? { username: value.inboundUsername.trim() } : {}),
      ...(value.inboundPassword ? { password: value.inboundPassword } : {}),
      ...(allowed.length ? { allowedAddresses: allowed } : {}),
      mediaEncryption: value.mediaEncryption,
    };
    return {
      ...base,
      sipTrunk: {
        outbound: {
          address: value.address.trim(),
          transport: value.transport,
          mediaEncryption: value.mediaEncryption,
          ...(value.outboundUsername.trim() ? { username: value.outboundUsername.trim() } : {}),
          ...(value.outboundPassword ? { password: value.outboundPassword } : {}),
        },
        inbound,
      },
    };
  }

  /** Once the import went through the secrets have no further use here. */
  private forgetSecrets(): void {
    for (const name of SECRET_CONTROLS) this.form.controls[name].setValue('');
  }
}
