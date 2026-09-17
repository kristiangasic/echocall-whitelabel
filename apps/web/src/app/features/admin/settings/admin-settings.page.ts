import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrandingService } from '../../../core/branding/branding.service';
import { brandTheme } from '../../../core/branding/color';
import { readApiError } from '../../../core/errors/api-error';
import { type Branding, LANGUAGES, type SmtpInput, type SmtpView } from '../../../core/models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { hexColorValidator, urlValidator } from '../../../shared/forms/validators';
import { HubSettingsComponent } from './hub-settings.component';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
/** Keeps the base64 data URL under the 200 KB the API accepts. */
const LOGO_MAX_BYTES = 140 * 1024;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

@Component({
  selector: 'app-admin-settings-page',
  imports: [
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    TranslocoDirective,
    FieldErrorPipe,
    HubSettingsComponent,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('admin.settings.title') }}</h1>
      <mat-tab-group [selectedIndex]="tab()" (selectedIndexChange)="onTab($event)">
        <mat-tab [label]="t('admin.settings.branding.tab')">
          <form [formGroup]="brandingForm" (ngSubmit)="saveBranding()" novalidate class="tab-body">
            <p class="intro">{{ t('admin.settings.branding.intro') }}</p>
            <div class="settings-grid">
              <div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>{{ t('admin.settings.branding.productName') }}</mat-label>
                  <input matInput formControlName="productName" maxlength="60" data-testid="product-name" />
                  @if (brandingForm.controls.productName | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>

                <div class="logo-row">
                  @if (logo(); as src) {
                    <img class="logo-preview" [src]="src" alt="" />
                  }
                  <input
                    #logoInput
                    type="file"
                    hidden
                    [accept]="logoTypes"
                    (change)="onLogo($event)"
                    data-testid="logo-input"
                  />
                  <button mat-stroked-button type="button" (click)="logoInput.click()">
                    <mat-icon>upload</mat-icon>
                    {{ t('admin.settings.branding.uploadLogo') }}
                  </button>
                  @if (logo()) {
                    <button
                      mat-button
                      type="button"
                      (click)="brandingForm.controls.logoDataUrl.setValue(null)"
                    >
                      {{ t('admin.settings.branding.removeLogo') }}
                    </button>
                  }
                </div>
                <p class="hint">{{ t('admin.settings.branding.logoHint') }}</p>

                <div class="color-row">
                  <input
                    type="color"
                    class="color-picker"
                    [value]="swatch()"
                    (input)="onColorPicked($event)"
                    [attr.aria-label]="t('admin.settings.branding.primaryColor')"
                  />
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('admin.settings.branding.primaryColor') }}</mat-label>
                    <input
                      matInput
                      formControlName="primaryColor"
                      maxlength="7"
                      data-testid="primary-color"
                    />
                    @if (brandingForm.controls.primaryColor | fieldError; as e) {
                      <mat-error>{{ t(e.key, e.params) }}</mat-error>
                    }
                  </mat-form-field>
                </div>

                <mat-form-field appearance="outline" class="full">
                  <mat-label>{{ t('admin.settings.branding.supportEmail') }}</mat-label>
                  <input matInput type="email" formControlName="supportEmail" />
                  @if (brandingForm.controls.supportEmail | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>{{ t('admin.settings.branding.imprintUrl') }}</mat-label>
                  <input matInput type="url" formControlName="imprintUrl" placeholder="https://" />
                  @if (brandingForm.controls.imprintUrl | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>{{ t('admin.settings.branding.privacyUrl') }}</mat-label>
                  <input matInput type="url" formControlName="privacyUrl" placeholder="https://" />
                  @if (brandingForm.controls.privacyUrl | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>{{ t('admin.settings.branding.defaultLanguage') }}</mat-label>
                  <mat-select formControlName="defaultLanguage">
                    @for (lang of languages; track lang) {
                      <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>

              <aside class="preview" [style]="previewStyle()" aria-hidden="true">
                <p class="hint preview-label">{{ t('admin.settings.branding.preview') }}</p>
                <div class="preview-bar">
                  @if (logo(); as src) {
                    <img class="preview-logo" [src]="src" alt="" />
                  } @else {
                    <span class="preview-mark"></span>
                  }
                  <span>{{
                    brandingForm.controls.productName.value || t('admin.settings.branding.productName')
                  }}</span>
                </div>
                <div class="preview-body">
                  <button mat-flat-button type="button" tabindex="-1">{{ t('actions.save') }}</button>
                  <button mat-stroked-button type="button" tabindex="-1">{{ t('actions.cancel') }}</button>
                  <span class="preview-chip">{{ t('statuses.active') }}</span>
                </div>
              </aside>
            </div>
            <button mat-flat-button type="submit" [disabled]="savingBranding()" data-testid="save-branding">
              {{ t('actions.save') }}
            </button>
          </form>
        </mat-tab>

        <mat-tab [label]="t('admin.settings.mail.tab')">
          <div class="tab-body">
            <p class="intro">{{ t('admin.settings.mail.intro') }}</p>
            @if (smtpLoading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            @if (smtp(); as view) {
              <p class="source" data-testid="smtp-source">
                <mat-icon>{{ view.configured ? 'check_circle' : 'info' }}</mat-icon>
                {{
                  view.source === 'env'
                    ? t('admin.settings.mail.envSource')
                    : view.source === 'settings'
                      ? t('admin.settings.mail.settingsSource')
                      : t('admin.settings.mail.notConfigured')
                }}
              </p>
            }
            <form [formGroup]="smtpForm" (ngSubmit)="saveSmtp()" novalidate>
              <div class="row">
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('admin.settings.mail.host') }}</mat-label>
                  <input matInput formControlName="host" autocomplete="off" data-testid="smtp-host" />
                  @if (smtpForm.controls.host | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('admin.settings.mail.port') }}</mat-label>
                  <input matInput type="number" formControlName="port" min="1" max="65535" />
                  @if (smtpForm.controls.port | fieldError; as e) {
                    <mat-error>{{ t(e.key, e.params) }}</mat-error>
                  }
                </mat-form-field>
              </div>
              <mat-slide-toggle formControlName="secure" class="toggle">{{
                t('admin.settings.mail.secure')
              }}</mat-slide-toggle>
              <div class="row">
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('admin.settings.mail.user') }}</mat-label>
                  <input matInput formControlName="user" autocomplete="off" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('admin.settings.mail.pass') }}</mat-label>
                  <input matInput type="password" formControlName="pass" autocomplete="new-password" />
                  @if (smtp()?.hasPassword) {
                    <mat-hint>{{ t('admin.settings.mail.passKeep') }}</mat-hint>
                  }
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full">
                <mat-label>{{ t('admin.settings.mail.from') }}</mat-label>
                <input
                  matInput
                  formControlName="from"
                  autocomplete="off"
                  placeholder="Portal <portal@example.com>"
                />
                @if (smtpForm.controls.from | fieldError; as e) {
                  <mat-error>{{ t(e.key, e.params) }}</mat-error>
                }
              </mat-form-field>
              <div class="actions">
                <button mat-flat-button type="submit" [disabled]="savingSmtp()" data-testid="save-smtp">
                  {{ t('actions.save') }}
                </button>
                @if (smtp()?.source === 'settings') {
                  <button mat-stroked-button type="button" (click)="removeSmtp()">
                    {{ t('admin.settings.mail.remove') }}
                  </button>
                }
              </div>
            </form>

            <h2 class="section-title">{{ t('admin.settings.mail.test') }}</h2>
            <form [formGroup]="testForm" (ngSubmit)="sendTest()" novalidate class="test-row">
              <mat-form-field appearance="outline" class="full">
                <mat-label>{{ t('admin.settings.mail.testTo') }}</mat-label>
                <input matInput type="email" formControlName="to" />
                @if (testForm.controls.to | fieldError; as e) {
                  <mat-error>{{ t(e.key, e.params) }}</mat-error>
                }
              </mat-form-field>
              <button mat-stroked-button type="submit" [disabled]="testing() || !smtp()?.configured">
                <mat-icon>send</mat-icon>
                {{ t('actions.send') }}
              </button>
            </form>
          </div>
        </mat-tab>

        <mat-tab [label]="t('admin.settings.hub.tab')">
          <div class="tab-body">
            @if (hubOpened()) {
              <app-hub-settings />
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </ng-container>
  `,
  styles: `
    .tab-body {
      padding: 24px 0;
      max-width: 960px;
    }
    .intro,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .hint {
      font: var(--mat-sys-body-small);
      margin: 4px 0 16px;
    }
    .settings-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
      gap: 32px;
      margin-bottom: 16px;
    }
    @media (max-width: 800px) {
      .settings-grid {
        grid-template-columns: 1fr;
      }
    }
    .logo-row,
    .color-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .logo-preview {
      max-height: 48px;
      max-width: 180px;
    }
    .color-picker {
      width: 48px;
      height: 48px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 8px;
      background: none;
      margin-bottom: 22px;
    }
    .preview {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      overflow: hidden;
      align-self: start;
      background: var(--mat-sys-surface-container-low);
    }
    .preview-label {
      margin: 8px 12px;
    }
    .preview-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--mat-sys-surface);
      border-block: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-title-medium);
    }
    .preview-logo {
      max-height: 32px;
      max-width: 120px;
    }
    .preview-mark {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: var(--mat-sys-primary);
    }
    .preview-body {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 16px;
    }
    .preview-chip {
      padding: 2px 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .source {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toggle {
      display: block;
      margin: 0 0 16px;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .section-title {
      font: var(--mat-sys-title-medium);
      margin: 32px 0 8px;
    }
    .test-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      max-width: 560px;
    }
    .test-row button {
      margin-top: 4px;
    }
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly branding = inject(BrandingService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly languages = LANGUAGES;
  readonly logoTypes = LOGO_TYPES.join(',');
  /**
   * The service settings are fetched the first time their tab is opened and
   * kept afterwards, so moving between the tabs costs nothing.
   */
  readonly hubOpened = signal(false);
  readonly tab = signal(0);

  readonly brandingForm = this.fb.group({
    productName: [this.branding.branding().productName, [Validators.required, Validators.maxLength(60)]],
    logoDataUrl: this.fb.control<string | null>(this.branding.branding().logoDataUrl),
    primaryColor: [this.branding.branding().primaryColor, [Validators.required, hexColorValidator]],
    supportEmail: [this.branding.branding().supportEmail ?? '', Validators.email],
    imprintUrl: [this.branding.branding().imprintUrl ?? '', [Validators.maxLength(500), urlValidator]],
    privacyUrl: [this.branding.branding().privacyUrl ?? '', [Validators.maxLength(500), urlValidator]],
    defaultLanguage: [this.branding.branding().defaultLanguage],
  });
  readonly savingBranding = signal(false);

  readonly logo = toSignal(this.brandingForm.controls.logoDataUrl.valueChanges, {
    initialValue: this.brandingForm.controls.logoDataUrl.value,
  });
  private readonly color = toSignal(this.brandingForm.controls.primaryColor.valueChanges, {
    initialValue: this.brandingForm.controls.primaryColor.value,
  });
  /**
   * A colour input can only show a complete hex value, and so can the preview,
   * so both fall back to the saved colour while the field is being typed.
   */
  readonly swatch = computed(() => {
    const value = this.color();
    return HEX_COLOR.test(value) ? value : this.branding.branding().primaryColor;
  });
  /** Theme variables for the preview card. */
  readonly previewStyle = computed(() => brandTheme(this.swatch()));

  readonly smtp = signal<SmtpView | null>(null);
  readonly smtpLoading = signal(false);
  readonly savingSmtp = signal(false);
  readonly testing = signal(false);
  readonly smtpForm = this.fb.group({
    host: ['', [Validators.required, Validators.maxLength(253)]],
    port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    secure: [false],
    user: ['', Validators.maxLength(200)],
    pass: ['', Validators.maxLength(500)],
    from: ['', [Validators.required, Validators.maxLength(320)]],
  });
  readonly testForm = this.fb.group({
    to: [this.auth.user()?.email ?? '', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    void this.loadSmtp();
  }

  onTab(index: number): void {
    this.tab.set(index);
    if (index === 2) this.hubOpened.set(true);
  }

  /**
   * The picker writes through the same control as the hex field, because a
   * second binding on the control would leave one of the two showing a colour
   * the portal is not going to save.
   */
  onColorPicked(event: Event): void {
    const control = this.brandingForm.controls.primaryColor;
    control.setValue((event.target as HTMLInputElement).value);
    control.markAsDirty();
  }

  onLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.notify.error('admin.settings.branding.logoType');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.notify.error('admin.settings.branding.logoTooLarge');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.brandingForm.controls.logoDataUrl.setValue(String(reader.result));
    reader.readAsDataURL(file);
  }

  async saveBranding(): Promise<void> {
    if (this.brandingForm.invalid) {
      this.brandingForm.markAllAsTouched();
      return;
    }
    this.savingBranding.set(true);
    try {
      const value = this.brandingForm.getRawValue();
      const body: Branding = {
        productName: value.productName.trim(),
        logoDataUrl: value.logoDataUrl,
        primaryColor: value.primaryColor.toLowerCase(),
        supportEmail: value.supportEmail.trim() || null,
        imprintUrl: value.imprintUrl.trim() || null,
        privacyUrl: value.privacyUrl.trim() || null,
        defaultLanguage: value.defaultLanguage,
      };
      const saved = await firstValueFrom(this.api.put<Branding>('/admin/settings/branding', body));
      this.branding.update(saved);
      this.notify.success('admin.settings.branding.saved');
    } catch (err) {
      if (!applyServerErrors(this.brandingForm, readApiError(err))) this.notify.apiError(err);
    } finally {
      this.savingBranding.set(false);
    }
  }

  async loadSmtp(): Promise<void> {
    this.smtpLoading.set(true);
    try {
      const view = await firstValueFrom(this.api.get<SmtpView>('/admin/settings/smtp'));
      this.smtp.set(view);
      this.smtpForm.reset({
        host: view.host ?? '',
        port: view.port ?? 587,
        secure: view.secure,
        user: view.user ?? '',
        pass: '',
        from: view.from ?? '',
      });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.smtpLoading.set(false);
    }
  }

  async saveSmtp(): Promise<void> {
    if (this.smtpForm.invalid) {
      this.smtpForm.markAllAsTouched();
      return;
    }
    this.savingSmtp.set(true);
    try {
      const value = this.smtpForm.getRawValue();
      const body: SmtpInput = {
        host: value.host.trim(),
        port: Number(value.port),
        secure: value.secure,
        user: value.user.trim() || null,
        from: value.from.trim(),
        ...(value.pass ? { pass: value.pass } : {}),
      };
      await firstValueFrom(this.api.put<SmtpView>('/admin/settings/smtp', body));
      this.notify.success('admin.settings.mail.saved');
      await this.loadSmtp();
    } catch (err) {
      if (!applyServerErrors(this.smtpForm, readApiError(err))) this.notify.apiError(err);
    } finally {
      this.savingSmtp.set(false);
    }
  }

  removeSmtp(): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.settings.mail.removeTitle',
      messageKey: 'admin.settings.mail.removeMessage',
      confirmKey: 'admin.settings.mail.remove',
      destructive: true,
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.api.delete<void>('/admin/settings/smtp'));
          this.notify.success('admin.settings.mail.removed');
          await this.loadSmtp();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  async sendTest(): Promise<void> {
    if (this.testForm.invalid) {
      this.testForm.markAllAsTouched();
      return;
    }
    this.testing.set(true);
    try {
      const { to } = this.testForm.getRawValue();
      await firstValueFrom(this.api.post<{ sent: boolean }>('/admin/settings/smtp/test', { to }));
      this.notify.success('admin.settings.mail.testSent', { email: to });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.testing.set(false);
    }
  }
}
