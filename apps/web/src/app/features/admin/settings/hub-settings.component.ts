import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCompany, ResellerSettings } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';

/** The company fields this form owns; the rest of the profile is left untouched. */
const COMPANY_FIELDS = ['companyName', 'companyLegalName', 'companyAddress', 'companyVatId'] as const;

type CompanyField = (typeof COMPANY_FIELDS)[number];

/**
 * The part of the operator profile that lives at the service rather than in the
 * portal: the company printed on the invoices the operator issues, the logo the
 * service shows, and the payment credentials it bills with.
 *
 * Credentials are write-only by design. The service never hands a stored secret
 * back, so the form reports whether one is on file and sends only the fields
 * that were actually filled in; an empty field means "leave it alone", which is
 * exactly how the service reads an absent key.
 */
@Component({
  selector: 'app-hub-settings',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <p class="intro">{{ t('admin.settings.hub.intro') }}</p>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <h2 class="section-title">{{ t('admin.settings.hub.company') }}</h2>
      <p class="hint">{{ t('admin.settings.hub.companyHint') }}</p>
      <form [formGroup]="companyForm" (ngSubmit)="saveCompany()" novalidate>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.companyName') }}</mat-label>
            <input matInput formControlName="companyName" data-testid="hub-company-name" />
            @if (companyForm.controls.companyName | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.legalName') }}</mat-label>
            <input matInput formControlName="companyLegalName" />
            @if (companyForm.controls.companyLegalName | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.address') }}</mat-label>
            <input matInput formControlName="companyAddress" />
            @if (companyForm.controls.companyAddress | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.vatId') }}</mat-label>
            <input matInput formControlName="companyVatId" />
            @if (companyForm.controls.companyVatId | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
        </div>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="save-hub-company">
          {{ t('actions.save') }}
        </button>
      </form>

      <h2 class="section-title">{{ t('admin.settings.hub.logo') }}</h2>
      <p class="hint">{{ t('admin.settings.hub.logoHint') }}</p>
      <form [formGroup]="logoForm" (ngSubmit)="saveLogo()" novalidate class="logo-row">
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ t('admin.settings.hub.logoUrl') }}</mat-label>
          <input matInput formControlName="logoUrl" placeholder="https://" data-testid="hub-logo-url" />
          @if (logoForm.controls.logoUrl | fieldError; as e) {
            <mat-error>{{ t(e.key, e.params) }}</mat-error>
          }
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="save-hub-logo">
          {{ t('actions.save') }}
        </button>
      </form>

      <h2 class="section-title">{{ t('admin.settings.hub.payments') }}</h2>
      <p class="hint">{{ t('admin.settings.hub.paymentsHint') }}</p>
      <ul class="states">
        <li>
          <mat-icon>{{ settings()?.stripeConfigured ? 'check_circle' : 'info' }}</mat-icon>
          {{ t('admin.settings.hub.stripeSecretKey') }}:
          {{
            settings()?.stripeConfigured ? t('admin.settings.hub.stored') : t('admin.settings.hub.notStored')
          }}
        </li>
        <li>
          <mat-icon>{{ settings()?.paypalConfigured ? 'check_circle' : 'info' }}</mat-icon>
          {{ t('admin.settings.hub.paypalClientSecret') }}:
          {{
            settings()?.paypalConfigured ? t('admin.settings.hub.stored') : t('admin.settings.hub.notStored')
          }}
        </li>
        @if (settings()?.stripePublishableKey; as key) {
          <li>
            <mat-icon>public</mat-icon>
            {{ t('admin.settings.hub.stripePublishableKey') }}: <code>{{ key }}</code>
          </li>
        }
      </ul>
      <form [formGroup]="keysForm" (ngSubmit)="saveKeys()" novalidate>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.stripePublishableKey') }}</mat-label>
            <input matInput formControlName="stripePublishableKey" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.stripeSecretKey') }}</mat-label>
            <input
              matInput
              type="password"
              formControlName="stripeSecretKey"
              autocomplete="new-password"
              data-testid="hub-stripe-secret"
            />
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.paypalClientId') }}</mat-label>
            <input matInput formControlName="paypalClientId" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.settings.hub.paypalClientSecret') }}</mat-label>
            <input
              matInput
              type="password"
              formControlName="paypalClientSecret"
              autocomplete="new-password"
            />
          </mat-form-field>
        </div>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="save-hub-keys">
          {{ t('actions.save') }}
        </button>
      </form>
    </ng-container>
  `,
  styles: `
    .intro,
    .hint {
      margin: 4px 0 16px;
    }
    .section-title {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 0;
    }
    .row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .row mat-form-field {
      flex: 1;
      min-width: 240px;
    }
    .logo-row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    /* One column wide, like every other field on this tab, rather than the
       whole width of the panel because it happens to stand on its own. */
    .logo-row .full {
      flex: 0 1 calc(50% - 8px);
      min-width: 240px;
    }
    .logo-row button {
      margin-top: 8px;
    }
    .states {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--mat-sys-on-surface-variant);
    }
    .states li {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    code {
      overflow-wrap: anywhere;
    }
  `,
})
export class HubSettingsComponent implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly settings = signal<ResellerSettings | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);

  /** The profile as the service last reported it, so a save can send only what changed. */
  private stored: Record<CompanyField, string> = {
    companyName: '',
    companyLegalName: '',
    companyAddress: '',
    companyVatId: '',
  };

  readonly companyForm = this.fb.group({
    companyName: ['', Validators.maxLength(200)],
    companyLegalName: ['', Validators.maxLength(200)],
    companyAddress: ['', Validators.maxLength(500)],
    companyVatId: ['', Validators.maxLength(64)],
  });

  readonly logoForm = this.fb.group({
    logoUrl: ['', Validators.maxLength(1000)],
  });

  readonly keysForm = this.fb.group({
    stripePublishableKey: ['', Validators.maxLength(500)],
    stripeSecretKey: ['', Validators.maxLength(500)],
    paypalClientId: ['', Validators.maxLength(500)],
    paypalClientSecret: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [company, settings] = await Promise.all([
        firstValueFrom(this.hub.get<ResellerCompany>('/resellers/company')),
        firstValueFrom(this.hub.get<ResellerSettings>('/resellers/settings')),
      ]);
      this.stored = {
        companyName: company.companyName ?? '',
        companyLegalName: company.companyLegalName ?? '',
        companyAddress: company.companyAddress ?? '',
        companyVatId: company.companyVatId ?? '',
      };
      this.companyForm.reset({ ...this.stored });
      this.logoForm.reset({ logoUrl: company.brandLogo ?? '' });
      // Credentials are never echoed back, so the fields start empty every time.
      this.keysForm.reset({
        stripePublishableKey: '',
        stripeSecretKey: '',
        paypalClientId: '',
        paypalClientSecret: '',
      });
      this.settings.set(settings);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Patches the fields that differ from what the service reported, and nothing else. */
  async saveCompany(): Promise<void> {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }
    const value = this.companyForm.getRawValue();
    const body: Partial<Record<CompanyField, string>> = {};
    for (const field of COMPANY_FIELDS) {
      const next = value[field].trim();
      if (next !== this.stored[field]) body[field] = next;
    }
    if (Object.keys(body).length === 0) {
      this.notify.success('admin.settings.hub.nothingChanged');
      return;
    }
    await this.send('/resellers/company', body);
  }

  /** An empty field means the logo should go, which the service takes as null. */
  async saveLogo(): Promise<void> {
    if (this.logoForm.invalid) {
      this.logoForm.markAllAsTouched();
      return;
    }
    const logoUrl = this.logoForm.getRawValue().logoUrl.trim();
    await this.send('/resellers/settings/logo', { logoUrl: logoUrl || null });
  }

  /** Only the filled fields are sent; an empty one leaves the stored credential alone. */
  async saveKeys(): Promise<void> {
    if (this.keysForm.invalid) {
      this.keysForm.markAllAsTouched();
      return;
    }
    const value = this.keysForm.getRawValue();
    const body: Record<string, string> = {};
    for (const [field, raw] of Object.entries(value)) {
      const key = raw.trim();
      if (key) body[field] = key;
    }
    if (Object.keys(body).length === 0) {
      this.notify.success('admin.settings.hub.nothingChanged');
      return;
    }
    await this.send('/resellers/settings/payment-keys', body);
  }

  private async send(path: string, body: object): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.hub.patch<{ success: boolean }>(path, body));
      this.notify.success('admin.settings.hub.saved');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }
}
