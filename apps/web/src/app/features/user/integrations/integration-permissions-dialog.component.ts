import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { readApiError } from '../../../core/errors/api-error';
import type { IntegrationPermissions, UpdateIntegrationPermissions } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';

export interface IntegrationPermissionsDialogData {
  integrationId: number;
  name: string;
}

type Preset = IntegrationPermissions['preset'];
type Tool = IntegrationPermissions['tools'][number];

/** One choice of the list: a preset with how many tools it allows. */
interface PresetOption {
  key: Preset;
  count: number;
  disabled: boolean;
}

/** What the service answers when it stored the permissions. */
interface SavedPermissions {
  data: IntegrationPermissions;
  agentsResynced?: number;
  agentsFailed?: number;
}

/** The presets in the order they go further. */
const PRESETS = ['read', 'read_write', 'full'] as const;

/**
 * Which tools the assistants may use through one connected service: a preset
 * that goes as far as reading, writing or everything, or a hand-picked list.
 * Only some services have such permissions; for the others the service answers
 * 404 and the dialog says that there is nothing to set.
 */
@Component({
  selector: 'app-integration-permissions-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('user.integrations.permissions.title', { name: data.name }) }}</h2>
      <form (ngSubmit)="save()">
        <mat-dialog-content class="content">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          @if (notAvailable()) {
            <p class="hint" data-testid="permissions-not-available">
              {{ t('user.integrations.permissions.notAvailable') }}
            </p>
          } @else if (permissions(); as current) {
            <p class="hint">{{ t('user.integrations.permissions.description', { name: data.name }) }}</p>
            <p class="note">{{ t('user.integrations.permissions.ownerNote') }}</p>
            @if (current.invalid) {
              <p class="alert" role="alert" data-testid="permissions-invalid">
                <mat-icon>warning</mat-icon>
                {{ t('user.integrations.permissions.invalid') }}
              </p>
            }

            <mat-radio-group
              name="preset"
              class="presets"
              [ngModel]="preset()"
              (ngModelChange)="choose($event)"
              [attr.aria-label]="t('user.integrations.permissions.title', { name: data.name })"
            >
              @for (option of options(); track option.key) {
                <mat-radio-button
                  [value]="option.key"
                  [disabled]="option.disabled"
                  [attr.data-testid]="'preset-' + option.key"
                >
                  <span class="preset-label">
                    {{ t('user.integrations.permissions.presets.' + option.key + '.label') }}
                    @if (option.key === current.defaultPreset) {
                      <span class="chip">{{ t('user.integrations.permissions.defaultBadge') }}</span>
                    }
                  </span>
                  <span class="preset-hint">
                    @if (option.disabled) {
                      {{ t('user.integrations.permissions.presetEmpty', { name: data.name }) }}
                    } @else {
                      {{ t('user.integrations.permissions.presets.' + option.key + '.hint') }}
                      {{
                        t('user.integrations.permissions.count', { allowed: option.count, total: total() })
                      }}
                    }
                  </span>
                </mat-radio-button>
              }
            </mat-radio-group>

            @if (preset() === 'full') {
              <p class="alert" data-testid="permissions-full-warning">
                <mat-icon>warning</mat-icon>
                {{ t('user.integrations.permissions.fullWarning') }}
              </p>
            }

            @if (preset() === 'custom') {
              <div class="custom">
                <div class="custom-head">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
                    <mat-label>{{ t('user.integrations.permissions.search') }}</mat-label>
                    <input matInput name="search" [ngModel]="search()" (ngModelChange)="search.set($event)" />
                  </mat-form-field>
                  <button mat-button type="button" (click)="selectAll(true)">
                    {{ t('user.integrations.permissions.selectAll') }}
                  </button>
                  <button mat-button type="button" (click)="selectAll(false)">
                    {{ t('user.integrations.permissions.selectNone') }}
                  </button>
                </div>
                @for (tool of shownTools(); track tool.key) {
                  <mat-checkbox
                    class="tool"
                    [checked]="selected().has(tool.key)"
                    (change)="toggle(tool.key, $event.checked)"
                    [attr.data-testid]="'permission-' + tool.key"
                  >
                    <span class="tool-label">
                      {{ tool.label }}
                      <span class="chip">{{ t('user.integrations.permissions.access.' + tool.access) }}</span>
                      @if (tool.recommended) {
                        <span class="chip">{{ t('user.integrations.permissions.recommended') }}</span>
                      }
                    </span>
                    @if (tool.descriptionSource === 'catalog' && tool.description) {
                      <span class="tool-hint">{{ tool.description }}</span>
                    }
                  </mat-checkbox>
                }
                @if (selected().size === 0) {
                  <p class="alert" role="alert">{{ t('user.integrations.permissions.customEmpty') }}</p>
                }
              </div>
            }
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          @if (notAvailable()) {
            <button mat-flat-button mat-dialog-close type="button">{{ t('actions.close') }}</button>
          } @else {
            <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
            <button mat-flat-button type="submit" [disabled]="!canSave()" data-testid="permissions-save">
              {{ t('actions.save') }}
            </button>
          }
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 560px;
    }
    .hint,
    .note {
      margin: 0;
    }
    .note,
    .preset-hint,
    .tool-hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .presets {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .preset-label,
    .tool-label {
      display: block;
    }
    .preset-hint,
    .tool-hint {
      display: block;
    }
    .chip {
      margin-left: 8px;
      padding: 1px 8px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-high);
      font: var(--mat-sys-label-small);
    }
    .alert {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--mat-sys-error);
    }
    .custom {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .custom-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .search {
      flex: 1 1 200px;
    }
  `,
})
export class IntegrationPermissionsDialogComponent implements OnInit {
  readonly data = inject<IntegrationPermissionsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<IntegrationPermissionsDialogComponent, boolean>>(MatDialogRef);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);

  readonly permissions = signal<IntegrationPermissions | null>(null);
  readonly notAvailable = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly preset = signal<Preset | null>(null);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly search = signal('');

  readonly total = computed(() => this.permissions()?.tools.length ?? 0);

  /**
   * The presets with what they allow. The earlier scope of a connection made
   * before permissions existed is shown while it is the stored one, but it
   * cannot be chosen again once something else was picked.
   */
  readonly options = computed<PresetOption[]>(() => {
    const current = this.permissions();
    if (!current) return [];
    const options: PresetOption[] = [];
    if (current.preset === 'legacy') {
      const allowed = current.tools.filter((tool) => tool.allowed).length;
      options.push({ key: 'legacy', count: allowed, disabled: false });
    }
    for (const key of PRESETS) {
      const preset = current.presets[key];
      options.push({ key, count: preset.count, disabled: preset.disabled });
    }
    options.push({ key: 'custom', count: this.selected().size, disabled: current.tools.length === 0 });
    return options;
  });

  readonly shownTools = computed<Tool[]>(() => {
    const tools = this.permissions()?.tools ?? [];
    const query = this.search().trim().toLowerCase();
    if (!query) return tools;
    return tools.filter(
      (tool) => tool.label.toLowerCase().includes(query) || tool.key.toLowerCase().includes(query),
    );
  });

  readonly canSave = computed(() => {
    const preset = this.preset();
    if (!this.permissions() || this.saving() || preset === null || preset === 'legacy') return false;
    if (preset === 'custom') return this.selected().size > 0;
    return !this.options().find((option) => option.key === preset)?.disabled;
  });

  ngOnInit(): void {
    void this.load();
  }

  choose(preset: Preset): void {
    this.preset.set(preset);
  }

  toggle(key: string, on: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Selects or clears the tools the search shows; the hidden ones keep their state. */
  selectAll(on: boolean): void {
    const keys = this.shownTools().map((tool) => tool.key);
    this.selected.update((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  async save(): Promise<void> {
    const preset = this.preset();
    if (!this.canSave() || preset === null || preset === 'legacy') return;
    const body: UpdateIntegrationPermissions =
      preset === 'custom' ? { preset, tools: [...this.selected()] } : { preset };
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.put<SavedPermissions>(`/integrations/${this.data.integrationId}/permissions`, body),
      );
      if ((result.agentsFailed ?? 0) > 0) {
        this.notify.error('user.integrations.permissions.agentsFailed');
      } else if ((result.agentsResynced ?? 0) > 0) {
        this.notify.success('user.integrations.permissions.savedAssistants', {
          count: result.agentsResynced,
        });
      } else {
        this.notify.success('user.integrations.permissions.saved');
      }
      this.dialogRef.close(true);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.get<{ data: IntegrationPermissions }>(
          `/integrations/${this.data.integrationId}/permissions`,
        ),
      );
      const current = result.data;
      this.permissions.set(current);
      this.selected.set(new Set(current.tools.filter((tool) => tool.allowed).map((tool) => tool.key)));
      // A choice that could not be read allows nothing: the operator picks again.
      this.preset.set(current.invalid ? null : current.preset);
    } catch (err) {
      if (readApiError(err).status === 404) this.notAvailable.set(true);
      else {
        this.notify.apiError(err);
        this.dialogRef.close(false);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
