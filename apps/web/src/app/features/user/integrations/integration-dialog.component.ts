import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { Integration, IntegrationType } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { IntegrationCatalogService, SETUP_OUTSIDE_PORTAL } from './integration-catalog.service';
import { configPayload, maskedKeys, parseConfig, rawConfig } from './integration-config';

/**
 * Field names the service treats as the place a secret is sent to, besides every
 * field of type `url`. When one of them changes, it no longer keeps the stored
 * secrets and asks for them again.
 */
const DESTINATION_FIELDS = new Set([
  'host',
  'url',
  'baseUrl',
  'endpoint',
  'server',
  'domain',
  'subdomain',
  'instanceUrl',
  'smtpHost',
  'webhookUrl',
  'apiEndpoint',
  'storeUrl',
  'shopUrl',
]);

/**
 * Fields that name where a secret goes only for one service. For Genesys Cloud the
 * stored client secret belongs to one OAuth client in one region; after a change
 * of either it has to be typed again.
 */
const TYPE_DESTINATION_FIELDS: Record<string, ReadonlySet<string>> = {
  genesys_cloud: new Set(['region', 'oauthClientId']),
};

/** One configuration field of the chosen type, with the parts the form needs filled in. */
interface ConfigField {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  required: boolean;
  options: { label: string; value: string }[];
}

/** Opened without an id to connect a service, with one to change an existing connection. */
export interface IntegrationDialogData {
  types: IntegrationType[];
  integrationId?: number;
  /** Preselects the service when the operator picked it from the catalog. */
  type?: string;
}

/**
 * Connects or edits one integration. The configuration fields come from the
 * catalog entry of the chosen type, so a new service is configurable as soon
 * as the service describes it. Secrets arrive masked and are only sent again
 * when the operator types a new value.
 */
@Component({
  selector: 'app-integration-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{ t(isNew() ? 'user.integrations.connectTitle' : 'user.integrations.editTitle') }}
      </h2>
      <form (ngSubmit)="save()">
        <mat-dialog-content class="fields">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          @if (isNew()) {
            <mat-form-field appearance="outline">
              <mat-label>{{ t('user.integrations.type') }}</mat-label>
              <mat-select
                name="type"
                [ngModel]="type()"
                (ngModelChange)="selectType($event)"
                data-testid="integration-type"
                required
              >
                @for (option of data.types; track option.type) {
                  <mat-option [value]="option.type">{{ option.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.integrations.name') }}</mat-label>
            <input
              matInput
              name="name"
              [ngModel]="name()"
              (ngModelChange)="name.set($event)"
              data-testid="integration-name"
              required
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.integrations.description') }}</mat-label>
            <input matInput name="description" [(ngModel)]="description" />
          </mat-form-field>

          @if (selected(); as entry) {
            <p class="hint">{{ explain(entry) }}</p>
            @if (setupElsewhere()) {
              <p class="hint" data-testid="integration-setup-elsewhere">
                {{ t('user.integrations.setupElsewhere') }}
              </p>
            }
            @if (entry.documentation) {
              <a class="hint" [href]="entry.documentation" target="_blank" rel="noopener">
                {{ t('user.integrations.documentation') }}
              </a>
            }
          }

          @for (field of fields(); track field.name) {
            @if (field.type === 'select') {
              <mat-form-field appearance="outline">
                <mat-label>{{ field.label }}</mat-label>
                <mat-select
                  [name]="field.name"
                  [ngModel]="value(field.name)"
                  (ngModelChange)="setValue(field.name, $event)"
                  [required]="field.required"
                >
                  @for (option of field.options; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else if (field.type === 'textarea') {
              <mat-form-field appearance="outline">
                <mat-label>{{ field.label }}</mat-label>
                <textarea
                  matInput
                  rows="3"
                  [name]="field.name"
                  [ngModel]="value(field.name)"
                  (ngModelChange)="setValue(field.name, $event)"
                  [placeholder]="field.placeholder"
                  [required]="field.required"
                ></textarea>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ field.label }}</mat-label>
                <input
                  matInput
                  [type]="inputType(field)"
                  [name]="field.name"
                  [ngModel]="value(field.name)"
                  (ngModelChange)="setValue(field.name, $event)"
                  [placeholder]="field.placeholder"
                  [required]="field.required && !isKept(field)"
                  [attr.data-testid]="'integration-field-' + field.name"
                />
                @if (isKept(field)) {
                  <mat-hint>{{ t('user.integrations.secretKept') }}</mat-hint>
                }
              </mat-form-field>
            }
          }

          @if (!isNew()) {
            <mat-slide-toggle name="active" [(ngModel)]="active" data-testid="integration-active">
              {{ t('user.integrations.active') }}
            </mat-slide-toggle>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="!canSave()" data-testid="integration-save">
            {{ t('actions.save') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 320px;
    }
    .hint {
      margin: 0 0 8px;
    }
  `,
})
export class IntegrationDialogComponent implements OnInit {
  readonly data = inject<IntegrationDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IntegrationDialogComponent, boolean>);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);
  private readonly texts = inject(IntegrationCatalogService);

  readonly type = signal<string | null>(null);
  readonly config = signal<Record<string, string>>({});
  /** Fields whose value the service sent masked: a secret is stored there. */
  readonly keptKeys = signal<Set<string>>(new Set());
  /** The configuration as loaded, to notice a changed destination. */
  private readonly loaded = signal<Record<string, string>>({});
  /** The configuration as loaded, every value in its own type, to send back what the form does not show. */
  private raw: Record<string, unknown> = {};
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly name = signal('');
  description = '';
  active = true;

  readonly isNew = computed(() => this.data.integrationId === undefined);
  readonly selected = computed<IntegrationType | null>(
    () => this.data.types.find((entry) => entry.type === this.type()) ?? null,
  );
  /** Fields without a name cannot be stored, so they are not offered. */
  readonly fields = computed<ConfigField[]>(() => {
    const entry = this.selected();
    if (entry === null) return [];
    return (entry.configFields ?? [])
      .filter((field) => !!field.name)
      .map((field) => {
        const name = field.name as string;
        return {
          name,
          label: this.texts.fieldLabel(entry.type, name, field.label ?? name),
          type: field.type ?? 'text',
          placeholder: this.texts.fieldHint(entry.type, name, field.placeholder ?? ''),
          required: !!field.required,
          options: (field.options ?? [])
            .filter((option) => option.value !== undefined)
            .map((option) => {
              const value = option.value as string;
              return {
                label: this.texts.optionLabel(entry.type, name, value, option.label ?? String(value)),
                value,
              };
            }),
        };
      });
  });
  /**
   * True once a field naming where the secrets go differs from the loaded value.
   * The service then no longer keeps the stored secrets, so they have to be typed again.
   * A masked field is the secret itself and does not count.
   */
  readonly destinationChanged = computed(() => {
    const loaded = this.loaded();
    const ofType = TYPE_DESTINATION_FIELDS[this.type() ?? ''];
    return this.fields().some(
      (field) =>
        (field.type === 'url' || DESTINATION_FIELDS.has(field.name) || !!ofType?.has(field.name)) &&
        !this.keptKeys().has(field.name) &&
        this.value(field.name).trim() !== (loaded[field.name] ?? '').trim(),
    );
  });
  readonly canSave = computed(() => !!this.type() && this.name().trim().length > 0 && !this.saving());
  /** A service whose access data the provider issues: the dialog says so. */
  readonly setupElsewhere = computed(() => SETUP_OUTSIDE_PORTAL.has(this.type() ?? ''));

  /** What the chosen service does, in the reader's language. */
  explain(entry: IntegrationType): string {
    return this.texts.description(entry);
  }

  ngOnInit(): void {
    if (this.isNew()) {
      if (this.data.type) this.selectType(this.data.type);
      return;
    }
    void this.load();
  }

  inputType(field: ConfigField): string {
    if (field.type === 'password') return 'password';
    if (field.type === 'number') return 'number';
    if (field.type === 'url') return 'url';
    return 'text';
  }

  /**
   * A secret that is stored but not shown: leaving the field empty keeps it. That
   * covers password fields and every field the service sent masked, as long as
   * the destination stays the same.
   */
  isKept(field: ConfigField): boolean {
    return (
      !this.isNew() &&
      !this.destinationChanged() &&
      !this.value(field.name) &&
      (field.type === 'password' || this.keptKeys().has(field.name))
    );
  }

  value(name: string): string {
    return this.config()[name] ?? '';
  }

  setValue(name: string, value: string): void {
    this.config.update((current) => ({ ...current, [name]: value }));
  }

  selectType(type: string): void {
    this.type.set(type);
    this.config.set({});
    this.keptKeys.set(new Set());
    this.loaded.set({});
    this.raw = {};
    if (!this.name().trim()) this.name.set(this.selected()?.name ?? '');
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      if (this.isNew()) {
        await firstValueFrom(
          this.hub.post('/integrations', {
            type: this.type(),
            name: this.name().trim(),
            ...(this.description.trim() ? { description: this.description.trim() } : {}),
            config: JSON.stringify(this.payload()),
          }),
        );
        this.notify.success('user.integrations.connected');
      } else {
        await firstValueFrom(
          this.hub.patch(`/integrations/${this.data.integrationId}`, {
            name: this.name().trim(),
            description: this.description.trim(),
            isActive: this.active,
            config: JSON.stringify(this.payload()),
          }),
        );
        this.notify.success('user.integrations.saved');
      }
      this.dialogRef.close(true);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Empty secret fields are dropped so the stored value survives the update, and
   * keys the form does not show go back as they came, a list as a list.
   */
  private payload(): Record<string, unknown> {
    return configPayload(this.raw, this.config(), new Set(this.fields().map((field) => field.name)));
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const integration = await firstValueFrom(
        this.hub.get<Integration>(`/integrations/${this.data.integrationId}`),
      );
      this.type.set(integration.type);
      this.name.set(integration.name);
      this.description = integration.description ?? '';
      this.active = integration.isActive;
      const config = parseConfig(integration.config);
      this.raw = rawConfig(integration.config);
      this.keptKeys.set(maskedKeys(integration.config));
      this.loaded.set(config);
      this.config.set(config);
    } catch (err) {
      this.notify.apiError(err);
      this.dialogRef.close(false);
    } finally {
      this.loading.set(false);
    }
  }
}
