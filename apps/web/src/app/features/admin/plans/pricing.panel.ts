import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatUnitPrice } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type {
  ResellerPricing,
  ResellerPricingSuggestion,
  UpdatePricingInput,
} from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';

/**
 * The tier names arrive from the hub in English ("Standard (25% Margin)"). Only
 * the first word identifies the tier, so that is what the portal maps onto its
 * own wording; a tier it does not know keeps the name the hub gave it.
 */
const TIERS = new Set(['minimal', 'standard', 'premium', 'enterprise']);

/**
 * What the operator charges its customers for a voice minute and a chat
 * session, next to what the platform charges for the same. The suggestion
 * buttons only fill the two fields; nothing leaves the browser until the
 * operator saves.
 */
@Component({
  selector: 'app-admin-pricing-panel',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <section class="panel">
        <h2 class="panel-title">{{ t('admin.pricing.title') }}</h2>
        <p class="intro">{{ t('admin.pricing.intro') }}</p>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="price-grid">
            <div class="price-row">
              <p class="price-label">{{ t('admin.pricing.voiceMinute') }}</p>
              <p class="price-base">
                {{ t('admin.pricing.basePrice') }}: {{ price(pricing()?.baseVoiceMinutePrice) }}
              </p>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.pricing.yourPrice') }}</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  formControlName="voice"
                  data-testid="voice-price"
                />
                <span matTextSuffix>&nbsp;EUR</span>
                @if (form.controls.voice | fieldError; as e) {
                  <mat-error>{{ t(e.key, e.params) }}</mat-error>
                }
              </mat-form-field>
              <p class="price-margin" data-testid="voice-margin">
                {{ t('admin.pricing.margin') }}: {{ price(pricing()?.voiceMinuteMargin) }}
              </p>
            </div>
            <div class="price-row">
              <p class="price-label">{{ t('admin.pricing.chatSession') }}</p>
              <p class="price-base">
                {{ t('admin.pricing.basePrice') }}: {{ price(pricing()?.baseChatSessionPrice) }}
              </p>
              <mat-form-field appearance="outline">
                <mat-label>{{ t('admin.pricing.yourPrice') }}</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  formControlName="chat"
                  data-testid="chat-price"
                />
                <span matTextSuffix>&nbsp;EUR</span>
                @if (form.controls.chat | fieldError; as e) {
                  <mat-error>{{ t(e.key, e.params) }}</mat-error>
                }
              </mat-form-field>
              <p class="price-margin" data-testid="chat-margin">
                {{ t('admin.pricing.margin') }}: {{ price(pricing()?.chatSessionMargin) }}
              </p>
            </div>
          </div>

          @if (suggestions().length) {
            <h3 class="suggestions-title">{{ t('admin.pricing.suggestions') }}</h3>
            <p class="intro">{{ t('admin.pricing.suggestionsIntro') }}</p>
            <div class="suggestions">
              @for (suggestion of suggestions(); track suggestion.tier) {
                <div class="suggestion">
                  <p class="suggestion-name">
                    @if (tierKey(suggestion.tier); as key) {
                      {{ t(key) }}
                    } @else {
                      {{ suggestion.tier }}
                    }
                  </p>
                  <p class="suggestion-prices">
                    {{ price(suggestion.voiceMinutePrice) }} / {{ price(suggestion.chatSessionPrice) }}
                  </p>
                  <p class="suggestion-margin">
                    {{ t('admin.pricing.marginPercent', { percent: suggestion.voiceMarginPercent ?? 0 }) }}
                  </p>
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="apply(suggestion)"
                    [attr.data-testid]="'apply-' + suggestion.tier"
                  >
                    {{ t('admin.pricing.apply') }}
                  </button>
                </div>
              }
            </div>
          }

          <div class="actions">
            @if (form.dirty) {
              <span class="unsaved" data-testid="unsaved">
                <mat-icon>edit_note</mat-icon>
                {{ t('admin.pricing.unsaved') }}
              </span>
            }
            <button mat-flat-button type="submit" [disabled]="saving()" data-testid="save-prices">
              {{ t('actions.save') }}
            </button>
          </div>
        </form>
      </section>
    </ng-container>
  `,
  styles: `
    .panel {
      background: var(--mat-sys-surface-container-low);
      border-radius: 12px;
      padding: 24px;
    }
    .panel-title {
      font: var(--mat-sys-title-medium);
      margin: 0 0 4px;
    }
    .intro {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .price-grid {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .price-row mat-form-field {
      width: 100%;
    }
    .price-label {
      font: var(--mat-sys-title-small);
      margin: 0 0 4px;
    }
    .price-base,
    .price-margin {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .suggestions-title {
      font: var(--mat-sys-title-small);
      margin: 8px 0 4px;
    }
    .suggestions {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      margin-bottom: 24px;
    }
    .suggestion {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 12px;
    }
    .suggestion-name {
      font: var(--mat-sys-title-small);
      margin: 0 0 4px;
    }
    .suggestion-prices,
    .suggestion-margin {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .actions {
      align-items: center;
      display: flex;
      gap: 16px;
      justify-content: flex-end;
    }
    .unsaved {
      align-items: center;
      color: var(--mat-sys-on-surface-variant);
      display: flex;
      font: var(--mat-sys-body-small);
      gap: 4px;
    }
  `,
})
export class AdminPricingPanel implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);

  readonly pricing = signal<ResellerPricing | null>(null);
  readonly suggestions = signal<ResellerPricingSuggestion[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    voice: [null as number | null, [Validators.required, Validators.min(0.01)]],
    chat: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  ngOnInit(): void {
    void this.load();
    void this.loadSuggestions();
  }

  price(value: number | null | undefined): string {
    return formatUnitPrice(value ?? null, this.language.current());
  }

  /** The translation key of a tier the portal has words for, otherwise null. */
  tierKey(tier: string): string | null {
    const first = tier.split(/[\s(]/)[0].toLowerCase();
    return TIERS.has(first) ? `admin.pricing.tiers.${first}` : null;
  }

  /** Fills the form with a suggested tier. Nothing is stored until the operator saves. */
  apply(suggestion: ResellerPricingSuggestion): void {
    this.form.setValue({ voice: suggestion.voiceMinutePrice, chat: suggestion.chatSessionPrice });
    this.form.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body: UpdatePricingInput = {
      resellerVoiceMinutePrice: Number(value.voice),
      resellerChatSessionPrice: Number(value.chat),
    };
    this.saving.set(true);
    try {
      await firstValueFrom(this.hub.patch<{ success: boolean }>('/resellers/pricing', body));
      this.notify.success('admin.pricing.saved');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const pricing = await firstValueFrom(this.hub.get<ResellerPricing>('/resellers/pricing'));
      this.pricing.set(pricing);
      this.form.setValue({
        voice: pricing.resellerVoiceMinutePrice,
        chat: pricing.resellerChatSessionPrice,
      });
      this.form.markAsPristine();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Suggestions are a convenience: when the hub cannot compute them the panel simply shows none. */
  private async loadSuggestions(): Promise<void> {
    try {
      this.suggestions.set(
        await firstValueFrom(this.hub.get<ResellerPricingSuggestion[]>('/resellers/pricing/suggestions')),
      );
    } catch {
      this.suggestions.set([]);
    }
  }
}
