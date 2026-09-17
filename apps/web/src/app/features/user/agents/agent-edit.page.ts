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
import { MatSliderModule } from '@angular/material/slider';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  DEFAULT_VOICE_LLM_MODEL,
  LLM_MODEL_OPTIONS,
  TTS_MODEL_OPTIONS,
} from '../../../core/hub/hub.constants';
import { HubService } from '../../../core/hub/hub.service';
import type { Agent, AvailableVoice, Language, Voice } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { KnowledgePanelComponent } from '../shared/knowledge-panel.component';

const SYSTEM_TOOLS = [
  'endCall',
  'voicemailDetection',
  'languageDetection',
  'playKeypadTouchTone',
  'skipTurn',
] as const;

@Component({
  selector: 'app-agent-edit-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
    KnowledgePanelComponent,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">
          {{ isNew() ? t('user.agents.createTitle') : t('user.agents.editTitle', { name: title() }) }}
        </h1>
        <a mat-stroked-button routerLink="/app/agents">
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
            <mat-card-title>{{ t('user.agents.sections.identity') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('fields.name') }}</mat-label>
              <input matInput formControlName="name" data-testid="agent-name" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.language') }}</mat-label>
              <mat-select formControlName="language" data-testid="agent-language">
                @for (lang of languages(); track lang.code) {
                  <mat-option [value]="lang.code">{{ lang.code }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.supportedLanguages') }}</mat-label>
              <mat-select formControlName="supportedLanguages" multiple>
                @for (lang of languages(); track lang.code) {
                  <mat-option [value]="lang.code">{{ lang.code }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ t('user.agents.supportedLanguagesHint') }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.voice') }}</mat-label>
              <mat-select formControlName="voiceId" data-testid="agent-voice">
                <mat-option value="">{{ t('user.agents.voiceDefault') }}</mat-option>
                @if (voices().length) {
                  <mat-optgroup [label]="t('user.agents.voicesOwn')">
                    @for (voice of voices(); track voice.id) {
                      <mat-option [value]="voice.id">{{ voice.name }}</mat-option>
                    }
                  </mat-optgroup>
                }
                @if (availableVoices().length) {
                  <mat-optgroup [label]="t('user.agents.voicesLibrary')">
                    @for (voice of availableVoices(); track voice.id) {
                      <mat-option [value]="voice.id">{{ voice.name }}</mat-option>
                    }
                  </mat-optgroup>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.ttsModel') }}</mat-label>
              <mat-select formControlName="ttsModel">
                <mat-option value="">{{ t('user.agents.ttsAuto') }}</mat-option>
                @for (model of ttsModels; track model.value) {
                  <mat-option [value]="model.value">{{ t(model.labelKey) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (!isNew()) {
              <mat-form-field appearance="outline">
                <mat-label>{{ t('fields.status') }}</mat-label>
                <mat-select formControlName="status">
                  <mat-option value="active">{{ t('user.agents.statuses.active') }}</mat-option>
                  <mat-option value="inactive">{{ t('user.agents.statuses.inactive') }}</mat-option>
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.agents.firstMessage') }}</mat-label>
              <textarea matInput formControlName="firstMessage" rows="2"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.agents.systemPrompt') }}</mat-label>
              <textarea
                matInput
                formControlName="systemPrompt"
                rows="8"
                data-testid="agent-prompt"
              ></textarea>
              <mat-hint>{{ t('user.agents.systemPromptHint') }}</mat-hint>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.agents.sections.voiceTuning') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <div class="slider-field">
              <span class="slider-label">{{ t('user.agents.speed') }}: {{ form.controls.speed.value }}</span>
              <mat-slider [min]="0.7" [max]="1.2" [step]="0.05" discrete>
                <input matSliderThumb formControlName="speed" />
              </mat-slider>
            </div>
            <div class="slider-field">
              <span class="slider-label">{{ t('user.agents.stability') }}: {{ form.controls.stability.value }}</span>
              <mat-slider [min]="0" [max]="1" [step]="0.05" discrete>
                <input matSliderThumb formControlName="stability" />
              </mat-slider>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.agents.sections.behavior') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.llmModel') }}</mat-label>
              <mat-select formControlName="llmModel">
                @for (model of llmModels; track model.value) {
                  <mat-option [value]="model.value">{{ t(model.labelKey) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.maxTokens') }}</mat-label>
              <input matInput type="number" formControlName="maxTokens" min="1" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.turnEagerness') }}</mat-label>
              <mat-select formControlName="turnEagerness">
                @for (value of ['patient', 'normal', 'eager']; track value) {
                  <mat-option [value]="value">{{ t('user.agents.turnEagernessValues.' + value) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="slider-field">
              <span class="slider-label">{{ t('user.agents.temperature') }}: {{ form.controls.temperature.value }}</span>
              <mat-slider [min]="0" [max]="100" [step]="1" discrete>
                <input matSliderThumb formControlName="temperature" />
              </mat-slider>
            </div>
            <mat-form-field appearance="outline" class="span-all">
              <mat-label>{{ t('user.agents.asrKeywords') }}</mat-label>
              <input matInput formControlName="asrKeywords" />
              <mat-hint>{{ t('user.agents.asrKeywordsHint') }}</mat-hint>
            </mat-form-field>
            <div class="toggles span-all">
              <mat-slide-toggle formControlName="enableInterruptions">
                {{ t('user.agents.enableInterruptions') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="enableBackchannel">
                {{ t('user.agents.enableBackchannel') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="enableFillers">
                {{ t('user.agents.enableFillers') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="backgroundVoiceDetection">
                {{ t('user.agents.backgroundVoiceDetection') }}
              </mat-slide-toggle>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.agents.sections.privacy') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.agents.retentionDays') }}</mat-label>
              <input matInput type="number" formControlName="retentionDays" min="-1" />
              <mat-hint>{{ t('user.agents.retentionDaysHint') }}</mat-hint>
            </mat-form-field>
            <div class="toggles span-all">
              <mat-slide-toggle formControlName="saveCallAudio">
                {{ t('user.agents.saveCallAudio') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="zeroPiiRetention">
                {{ t('user.agents.zeroPiiRetention') }}
              </mat-slide-toggle>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" formGroupName="tools">
          <mat-card-header>
            <mat-card-title>{{ t('user.agents.sections.systemTools') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="toggles">
              @for (tool of systemTools; track tool) {
                <mat-slide-toggle [formControlName]="tool">
                  {{ t('user.agents.tools.' + tool) }}
                </mat-slide-toggle>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ t('user.agents.sections.transfers') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content formArrayName="transferNumbers" class="stack">
            @for (row of transferNumbers.controls; track row; let i = $index) {
              <div class="transfer-row" [formGroupName]="i">
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('fields.name') }}</mat-label>
                  <input matInput formControlName="name" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ t('user.agents.transferNumber') }}</mat-label>
                  <input matInput formControlName="number" placeholder="+49301234567" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="grow">
                  <mat-label>{{ t('user.agents.transferDescription') }}</mat-label>
                  <input matInput formControlName="description" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeTransfer(i)"
                  [attr.aria-label]="t('actions.delete')"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            } @empty {
              <p class="hint">{{ t('user.agents.transfersEmpty') }}</p>
            }
            <div>
              <button mat-stroked-button type="button" (click)="addTransfer()">
                <mat-icon>add</mat-icon>
                {{ t('user.agents.addTransfer') }}
              </button>
            </div>
          </mat-card-content>
        </mat-card>

        <div class="actions">
          <button
            mat-flat-button
            type="submit"
            [disabled]="form.invalid || saving()"
            data-testid="agent-save"
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
            <app-knowledge-panel [basePath]="'/agents/' + id()" />
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
    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      padding: 8px 0;
    }
    .slider-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .slider-field .slider-label {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .slider-field mat-slider {
      width: 100%;
      margin: 0;
    }
    .transfer-row {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
      min-width: 200px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
    .knowledge {
      margin-top: 24px;
    }
  `,
})
export class AgentEditPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly ttsModels = TTS_MODEL_OPTIONS;
  readonly llmModels = LLM_MODEL_OPTIONS;
  readonly systemTools = SYSTEM_TOOLS;

  readonly id = signal<string | null>(null);
  readonly isNew = computed(() => this.id() === null);
  readonly title = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly languages = signal<Language[]>([]);
  readonly voices = signal<Voice[]>([]);
  readonly availableVoices = signal<AvailableVoice[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    language: ['de', Validators.required],
    supportedLanguages: [[] as string[]],
    voiceId: [''],
    ttsModel: [''],
    status: ['active' as 'active' | 'inactive'],
    firstMessage: [''],
    systemPrompt: [''],
    speed: [1],
    stability: [0.5],
    llmModel: [DEFAULT_VOICE_LLM_MODEL],
    temperature: [50],
    maxTokens: [1000],
    turnEagerness: ['normal' as 'patient' | 'normal' | 'eager'],
    enableInterruptions: [true],
    enableBackchannel: [true],
    enableFillers: [true],
    backgroundVoiceDetection: [false],
    asrKeywords: [''],
    retentionDays: [30],
    saveCallAudio: [false],
    zeroPiiRetention: [false],
    tools: this.fb.nonNullable.group({
      endCall: [false],
      voicemailDetection: [false],
      languageDetection: [false],
      playKeypadTouchTone: [false],
      skipTurn: [false],
    }),
    transferNumbers: this.fb.array<ReturnType<AgentEditPage['transferGroup']>>([]),
  });

  get transferNumbers() {
    return this.form.controls.transferNumbers;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.id.set(id === 'new' || id === null ? null : id);
    void this.loadOptions();
    if (this.id()) void this.loadAgent();
  }

  addTransfer(): void {
    this.transferNumbers.push(this.transferGroup());
    this.transferNumbers.markAsDirty();
  }

  removeTransfer(index: number): void {
    this.transferNumbers.removeAt(index);
    this.transferNumbers.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      if (this.isNew()) {
        await firstValueFrom(this.hub.post('/agents', this.createPayload()));
        this.notify.success('user.agents.created');
      } else {
        await firstValueFrom(this.hub.patch(`/agents/${this.id()}`, this.updatePayload()));
        this.notify.success('user.agents.saved');
      }
      await this.router.navigateByUrl('/app/agents');
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private transferGroup(row?: { name: string; number: string; description: string }) {
    return this.fb.nonNullable.group({
      name: [row?.name ?? '', Validators.required],
      number: [row?.number ?? '', Validators.required],
      description: [row?.description ?? ''],
    });
  }

  private async loadOptions(): Promise<void> {
    try {
      const [languages, voices, available] = await Promise.all([
        firstValueFrom(this.hub.get<Language[]>('/languages')),
        firstValueFrom(this.hub.list<Voice>('/voices')),
        firstValueFrom(this.hub.list<AvailableVoice>('/voices/available')),
      ]);
      this.languages.set(languages);
      this.voices.set(voices);
      this.availableVoices.set(available);
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private async loadAgent(): Promise<void> {
    this.loading.set(true);
    try {
      const agent = await firstValueFrom(this.hub.get<Agent>(`/agents/${this.id()}`));
      this.title.set(agent.name);
      this.form.patchValue({
        name: agent.name,
        language: agent.language ?? 'de',
        supportedLanguages: [agent.language, ...(agent.additionalLanguages ?? [])].filter(
          (v): v is string => !!v,
        ),
        voiceId: agent.voice?.id ?? '',
        status: agent.status,
        firstMessage: agent.firstMessage ?? '',
        systemPrompt: agent.systemPrompt ?? '',
        llmModel: agent.llmModel ?? DEFAULT_VOICE_LLM_MODEL,
        temperature: agent.temperature ?? 50,
        maxTokens: agent.maxTokens ?? 1000,
        enableInterruptions: agent.enableInterruptions ?? true,
        enableBackchannel: agent.enableBackchannel ?? true,
        enableFillers: agent.enableFillers ?? true,
        retentionDays: agent.privacySettings?.retentionDays ?? 30,
        saveCallAudio: agent.privacySettings?.saveCallAudio ?? false,
        zeroPiiRetention: agent.privacySettings?.zeroPiiRetention ?? false,
      });
      this.form.markAsPristine();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Every field of the create schema; optional selects are left out while empty. */
  private createPayload(): Record<string, unknown> {
    const v = this.form.getRawValue();
    return {
      name: v.name,
      language: v.language,
      ...(v.supportedLanguages.length
        ? { supportedLanguages: this.orderedLanguages(v.language, v.supportedLanguages) }
        : {}),
      ...(v.voiceId ? { voiceId: v.voiceId } : {}),
      ...(v.ttsModel ? { ttsModel: v.ttsModel } : {}),
      ...(v.firstMessage ? { firstMessage: v.firstMessage } : {}),
      ...(v.systemPrompt ? { systemPrompt: v.systemPrompt } : {}),
      speed: v.speed,
      stability: v.stability,
      llmModel: v.llmModel,
      temperature: v.temperature,
      maxTokens: v.maxTokens,
      turnEagerness: v.turnEagerness,
      enableInterruptions: v.enableInterruptions,
      enableBackchannel: v.enableBackchannel,
      enableFillers: v.enableFillers,
      backgroundVoiceDetection: v.backgroundVoiceDetection,
      ...(this.keywords(v.asrKeywords).length ? { asrKeywords: this.keywords(v.asrKeywords) } : {}),
      retentionDays: v.retentionDays,
      saveCallAudio: v.saveCallAudio,
      zeroPiiRetention: v.zeroPiiRetention,
      systemToolsConfig: v.tools,
      ...(v.transferNumbers.length ? { transferNumbers: v.transferNumbers } : {}),
    };
  }

  /** Only what the operator changed, so untouched hub-side settings stay as they are. */
  private updatePayload(): Record<string, unknown> {
    const v = this.form.getRawValue();
    const c = this.form.controls;
    const out: Record<string, unknown> = {};
    if (c.name.dirty) out['name'] = v.name;
    if (c.language.dirty) out['language'] = v.language;
    if (c.language.dirty || c.supportedLanguages.dirty)
      out['supportedLanguages'] = this.orderedLanguages(v.language, v.supportedLanguages);
    if (c.voiceId.dirty && v.voiceId) out['voiceId'] = v.voiceId;
    if (c.ttsModel.dirty && v.ttsModel) out['ttsModel'] = v.ttsModel;
    if (c.status.dirty) out['status'] = v.status;
    if (c.firstMessage.dirty) out['firstMessage'] = v.firstMessage;
    if (c.systemPrompt.dirty) out['systemPrompt'] = v.systemPrompt;
    if (c.speed.dirty) out['speed'] = v.speed;
    if (c.stability.dirty) out['stability'] = v.stability;
    if (c.llmModel.dirty) out['llmModel'] = v.llmModel;
    if (c.temperature.dirty) out['temperature'] = v.temperature;
    if (c.maxTokens.dirty) out['maxTokens'] = v.maxTokens;
    if (c.turnEagerness.dirty) out['turnEagerness'] = v.turnEagerness;
    if (c.enableInterruptions.dirty) out['enableInterruptions'] = v.enableInterruptions;
    if (c.enableBackchannel.dirty) out['enableBackchannel'] = v.enableBackchannel;
    if (c.enableFillers.dirty) out['enableFillers'] = v.enableFillers;
    if (c.backgroundVoiceDetection.dirty) out['backgroundVoiceDetection'] = v.backgroundVoiceDetection;
    if (c.asrKeywords.dirty) out['asrKeywords'] = this.keywords(v.asrKeywords);
    if (c.retentionDays.dirty) out['retentionDays'] = v.retentionDays;
    if (c.saveCallAudio.dirty) out['saveCallAudio'] = v.saveCallAudio;
    if (c.zeroPiiRetention.dirty) out['zeroPiiRetention'] = v.zeroPiiRetention;
    if (c.tools.dirty) out['systemToolsConfig'] = v.tools;
    if (c.transferNumbers.dirty) out['transferNumbers'] = v.transferNumbers;
    return out;
  }

  private orderedLanguages(primary: string, selected: string[]): string[] {
    return [primary, ...selected.filter((code) => code !== primary)];
  }

  private keywords(raw: string): string[] {
    return raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
}
