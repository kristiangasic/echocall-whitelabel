import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_CHAT_LLM_MODEL, LLM_MODEL_OPTIONS } from '../../../core/hub/hub.constants';
import { HubService } from '../../../core/hub/hub.service';
import type { Chatbot, Language } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { KnowledgePanelComponent } from '../shared/knowledge-panel.component';
import { IntegrationsPanelComponent } from '../shared/integrations-panel.component';

const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
const SIZES = ['small', 'medium', 'large'];
const STYLES = ['standard', 'rounded', 'compact'];

@Component({
  selector: 'app-chatbot-edit-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
    KnowledgePanelComponent,
    IntegrationsPanelComponent,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">
          {{ isNew() ? t('user.chatbots.createTitle') : t('user.chatbots.editTitle', { name: title() }) }}
        </h1>
        <a mat-stroked-button routerLink="/app/chatbots">
          <mat-icon>arrow_back</mat-icon>
          {{ t('actions.back') }}
        </a>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="stack">
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.chatbots.sections.identity') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.name') }}</mat-label>
              <input matInput formControlName="name" data-testid="chatbot-name" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.displayName') }}</mat-label>
              <input matInput formControlName="chatbotDisplayName" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.language') }}</mat-label>
              <mat-select formControlName="language" data-testid="chatbot-language">
                @for (lang of languages(); track lang.code) {
                  <mat-option [value]="lang.code">{{ lang.code }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.supportedLanguages') }}</mat-label>
              <mat-select formControlName="supportedLanguages" multiple>
                @for (lang of languages(); track lang.code) {
                  <mat-option [value]="lang.code">{{ lang.code }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (!isNew()) {
              <mat-form-field appearance="outline">
                <mat-label>{{ t('fields.status') }}</mat-label>
                <mat-select formControlName="status">
                  <mat-option value="active">{{ t('user.chatbots.statuses.active') }}</mat-option>
                  <mat-option value="inactive">{{ t('user.chatbots.statuses.inactive') }}</mat-option>
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.chatbots.greeting') }}</mat-label>
              <textarea matInput formControlName="greeting" rows="2"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.chatbots.systemPrompt') }}</mat-label>
              <textarea
                matInput
                formControlName="systemPrompt"
                rows="8"
                data-testid="chatbot-prompt"
              ></textarea>
              <mat-hint>{{ t('user.chatbots.systemPromptHint') }}</mat-hint>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.chatbots.sections.appearance') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.primaryColor') }}</mat-label>
              <input matInput type="color" formControlName="primaryColor" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.logoUrl') }}</mat-label>
              <input matInput type="url" formControlName="logoUrl" placeholder="https://example.com/logo.png" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.widgetPosition') }}</mat-label>
              <mat-select formControlName="widgetPosition">
                @for (value of positions; track value) {
                  <mat-option [value]="value">{{ t('user.chatbots.positions.' + value) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.widgetSize') }}</mat-label>
              <mat-select formControlName="widgetSize">
                @for (value of sizes; track value) {
                  <mat-option [value]="value">{{ t('user.chatbots.sizes.' + value) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.widgetStyle') }}</mat-label>
              <mat-select formControlName="widgetStyle">
                @for (value of styles; track value) {
                  <mat-option [value]="value">{{ t('user.chatbots.styles.' + value) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.widgetLanguage') }}</mat-label>
              <mat-select formControlName="widgetLanguage">
                <mat-option value="">{{ t('user.chatbots.widgetLanguageAuto') }}</mat-option>
                @for (lang of languages(); track lang.code) {
                  <mat-option [value]="lang.code">{{ lang.code }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.chatbots.teaserMessage') }}</mat-label>
              <input matInput formControlName="teaserMessage" />
              <mat-hint>{{ t('user.chatbots.teaserHint') }}</mat-hint>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.chatbots.sections.behavior') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.llmModel') }}</mat-label>
              <mat-select formControlName="llmModel">
                @for (model of llmModels; track model.value) {
                  <mat-option [value]="model.value">{{ t(model.labelKey) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="toggles span-all">
              <mat-slide-toggle formControlName="textOnlyMode">
                {{ t('user.chatbots.textOnlyMode') }}
              </mat-slide-toggle>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.chatbots.sections.domains') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ t('user.chatbots.allowedDomains') }}</mat-label>
              <input matInput formControlName="allowedDomains" data-testid="chatbot-domains" />
              <mat-hint>{{ t('user.chatbots.allowedDomainsHint') }}</mat-hint>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.chatbots.sections.privacy') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.chatbots.retentionDays') }}</mat-label>
              <input matInput type="number" formControlName="retentionDays" min="-1" />
              <mat-hint>{{ t('user.chatbots.retentionDaysHint') }}</mat-hint>
            </mat-form-field>
            <div class="toggles span-all">
              <mat-slide-toggle formControlName="saveConversations">
                {{ t('user.chatbots.saveConversations') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="zeroPiiRetention">
                {{ t('user.chatbots.zeroPiiRetention') }}
              </mat-slide-toggle>
            </div>
          </mat-card-content>
        </mat-card>

        <div class="actions">
          <button
            mat-flat-button
            type="submit"
            [disabled]="form.invalid || saving()"
            data-testid="chatbot-save"
          >
            {{ t('actions.save') }}
          </button>
        </div>
      </form>

      @if (!isNew()) {
        <mat-card appearance="outlined" class="knowledge">
          <mat-card-header>
            <mat-card-title>{{ t('user.knowledge.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('user.knowledge.hint') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <app-knowledge-panel [basePath]="'/chatbots/' + id()" />
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" class="knowledge">
          <mat-card-header>
            <mat-card-title>{{ t('user.integrations.title') }}</mat-card-title>
            <mat-card-subtitle>{{ t('user.integrations.assistantHint') }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <app-integrations-panel [basePath]="'/chatbots/' + id()" />
          </mat-card-content>
        </mat-card>
      }
    </ng-container>
  `,
  styles: `
    .stack {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px 16px;
      padding-top: 12px;
    }
    .span-all {
      grid-column: 1 / -1;
    }
    .full {
      width: 100%;
      margin-top: 12px;
    }
    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      padding: 8px 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    .knowledge {
      margin-top: 24px;
    }
  `,
})
export class ChatbotEditPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly positions = POSITIONS;
  readonly sizes = SIZES;
  readonly styles = STYLES;
  readonly llmModels = LLM_MODEL_OPTIONS;

  readonly id = signal<number | null>(null);
  readonly isNew = computed(() => this.id() === null);
  readonly title = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly languages = signal<Language[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    chatbotDisplayName: [''],
    language: ['de', Validators.required],
    supportedLanguages: [[] as string[]],
    status: ['active' as 'active' | 'inactive'],
    greeting: [''],
    systemPrompt: [''],
    primaryColor: ['#3b82f6'],
    logoUrl: [''],
    widgetPosition: ['bottom-right'],
    widgetSize: ['medium'],
    widgetStyle: ['rounded'],
    widgetLanguage: [''],
    teaserMessage: [''],
    llmModel: [DEFAULT_CHAT_LLM_MODEL],
    textOnlyMode: [true],
    allowedDomains: [''],
    retentionDays: [30],
    saveConversations: [true],
    zeroPiiRetention: [false],
  });

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.id.set(raw === 'new' || raw === null ? null : Number(raw));
    void this.loadLanguages();
    if (this.id() !== null) void this.loadChatbot();
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      if (this.isNew()) {
        await firstValueFrom(this.hub.post('/chatbots', this.createPayload()));
        this.notify.success('user.chatbots.created');
      } else {
        await firstValueFrom(this.hub.patch(`/chatbots/${this.id()}`, this.updatePayload()));
        this.notify.success('user.chatbots.saved');
      }
      await this.router.navigateByUrl('/app/chatbots');
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadLanguages(): Promise<void> {
    try {
      this.languages.set(await firstValueFrom(this.hub.get<Language[]>('/languages')));
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private async loadChatbot(): Promise<void> {
    this.loading.set(true);
    try {
      const bot = await firstValueFrom(this.hub.get<Chatbot>(`/chatbots/${this.id()}`));
      this.title.set(bot.name);
      this.form.patchValue({
        name: bot.name,
        chatbotDisplayName: bot.chatbotDisplayName ?? '',
        language: bot.language ?? 'de',
        supportedLanguages: bot.supportedLanguages ?? [],
        status: bot.status,
        greeting: bot.greeting ?? '',
        systemPrompt: bot.systemPrompt ?? '',
        primaryColor: bot.primaryColor ?? '#3b82f6',
        logoUrl: bot.logoUrl ?? '',
        widgetPosition: bot.widgetPosition ?? 'bottom-right',
        widgetSize: bot.widgetSize ?? 'medium',
        widgetStyle: bot.widgetStyle ?? 'rounded',
        widgetLanguage: bot.widgetLanguage ?? '',
        teaserMessage: bot.teaserMessage ?? '',
        llmModel: bot.llmModel ?? DEFAULT_CHAT_LLM_MODEL,
        textOnlyMode: bot.textOnlyMode ?? true,
        allowedDomains: (bot.allowedDomains ?? []).join(', '),
        retentionDays: bot.retentionDays ?? 30,
        saveConversations: bot.saveConversations ?? true,
        zeroPiiRetention: bot.zeroPiiRetention ?? false,
      });
      this.form.markAsPristine();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  private createPayload(): Record<string, unknown> {
    const v = this.form.getRawValue();
    return {
      name: v.name,
      language: v.language,
      ...(v.chatbotDisplayName ? { chatbotDisplayName: v.chatbotDisplayName } : {}),
      ...(v.supportedLanguages.length ? { supportedLanguages: v.supportedLanguages } : {}),
      ...(v.greeting ? { greeting: v.greeting } : {}),
      ...(v.systemPrompt ? { systemPrompt: v.systemPrompt } : {}),
      primaryColor: v.primaryColor,
      ...(v.logoUrl ? { logoUrl: v.logoUrl } : {}),
      widgetPosition: v.widgetPosition,
      widgetSize: v.widgetSize,
      widgetStyle: v.widgetStyle,
      ...(v.widgetLanguage ? { widgetLanguage: v.widgetLanguage } : {}),
      ...(v.teaserMessage ? { teaserMessage: v.teaserMessage } : {}),
      llmModel: v.llmModel,
      textOnlyMode: v.textOnlyMode,
      ...(this.domains(v.allowedDomains).length ? { allowedDomains: this.domains(v.allowedDomains) } : {}),
      retentionDays: v.retentionDays,
      saveConversations: v.saveConversations,
      zeroPiiRetention: v.zeroPiiRetention,
    };
  }

  /** Only what the operator changed, so hub-side settings this editor does not show stay as they are. */
  private updatePayload(): Record<string, unknown> {
    const v = this.form.getRawValue();
    const c = this.form.controls;
    const out: Record<string, unknown> = {};
    if (c.name.dirty) out['name'] = v.name;
    if (c.chatbotDisplayName.dirty) out['chatbotDisplayName'] = v.chatbotDisplayName;
    if (c.language.dirty) out['language'] = v.language;
    if (c.supportedLanguages.dirty) out['supportedLanguages'] = v.supportedLanguages;
    if (c.status.dirty) out['status'] = v.status;
    if (c.greeting.dirty) out['greeting'] = v.greeting;
    if (c.systemPrompt.dirty) out['systemPrompt'] = v.systemPrompt;
    if (c.primaryColor.dirty) out['primaryColor'] = v.primaryColor;
    if (c.logoUrl.dirty) out['logoUrl'] = v.logoUrl;
    if (c.widgetPosition.dirty) out['widgetPosition'] = v.widgetPosition;
    if (c.widgetSize.dirty) out['widgetSize'] = v.widgetSize;
    if (c.widgetStyle.dirty) out['widgetStyle'] = v.widgetStyle;
    if (c.widgetLanguage.dirty) out['widgetLanguage'] = v.widgetLanguage;
    if (c.teaserMessage.dirty) out['teaserMessage'] = v.teaserMessage;
    if (c.llmModel.dirty) out['llmModel'] = v.llmModel;
    if (c.textOnlyMode.dirty) out['textOnlyMode'] = v.textOnlyMode;
    if (c.allowedDomains.dirty) out['allowedDomains'] = this.domains(v.allowedDomains);
    if (c.retentionDays.dirty) out['retentionDays'] = v.retentionDays;
    if (c.saveConversations.dirty) out['saveConversations'] = v.saveConversations;
    if (c.zeroPiiRetention.dirty) out['zeroPiiRetention'] = v.zeroPiiRetention;
    return out;
  }

  private domains(raw: string): string[] {
    return raw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }
}
