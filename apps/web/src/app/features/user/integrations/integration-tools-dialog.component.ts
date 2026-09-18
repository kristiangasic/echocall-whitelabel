import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { CatalogTool } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';

/**
 * Without `selection` the dialog only shows what an integration can do.
 * With it, the tools are selectable: `null` means the recommended set of the
 * integration type, a list means exactly those tools, an empty list means none.
 */
export interface IntegrationToolsDialogData {
  integrationId: number;
  name: string;
  selection?: string[] | null;
}

/** What the caller stores when the selection was changed. */
export interface IntegrationToolsResult {
  enabledTools: string[] | null;
}

@Component({
  selector: 'app-integration-tools-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
    MatListModule,
    MatProgressBarModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ data.name }}</h2>
      <mat-dialog-content>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        @if (selectable) {
          <p class="hint">{{ t('user.integrations.toolsHint') }}</p>
          <mat-checkbox
            [checked]="useRecommended()"
            (change)="setRecommended($event.checked)"
            data-testid="tools-recommended"
          >
            {{ t('user.integrations.useRecommended') }}
          </mat-checkbox>
        }
        <mat-list data-testid="integration-tools">
          @for (tool of tools(); track tool.name) {
            <mat-list-item [class.dimmed]="selectable && useRecommended()">
              @if (selectable) {
                <mat-checkbox
                  matListItemIcon
                  [checked]="isEnabled(tool)"
                  [disabled]="useRecommended()"
                  (change)="toggle(tool, $event.checked)"
                  [attr.data-testid]="'tool-' + tool.name"
                />
              }
              <span matListItemTitle>
                {{ tool.name }}
                <span class="access">{{ t('user.integrations.access.' + tool.access) }}</span>
                @if (recommended().includes(tool.name)) {
                  <span class="access">{{ t('user.integrations.recommended') }}</span>
                }
              </span>
              <span matListItemLine>{{ tool.description }}</span>
            </mat-list-item>
          } @empty {
            <p class="hint">{{ t('user.integrations.noTools') }}</p>
          }
        </mat-list>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (selectable) {
          <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="button" (click)="apply()" data-testid="tools-save">
            {{ t('actions.save') }}
          </button>
        } @else {
          <button mat-flat-button mat-dialog-close type="button">{{ t('actions.close') }}</button>
        }
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .hint {
      margin: 0 0 8px;
    }
    .access {
      margin-left: 8px;
      padding: 1px 8px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-high);
      font: var(--mat-sys-label-small);
    }
    .dimmed {
      opacity: 0.6;
    }
  `,
})
export class IntegrationToolsDialogComponent implements OnInit {
  readonly data = inject<IntegrationToolsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<IntegrationToolsDialogComponent, IntegrationToolsResult>>(MatDialogRef);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);

  readonly selectable = 'selection' in this.data;
  readonly tools = signal<CatalogTool[]>([]);
  readonly recommended = signal<string[]>([]);
  readonly loading = signal(false);
  readonly useRecommended = signal(this.data.selection === null);
  readonly enabled = signal<string[]>(this.data.selection ?? []);

  ngOnInit(): void {
    void this.load();
  }

  isEnabled(tool: CatalogTool): boolean {
    if (this.useRecommended()) return this.recommended().includes(tool.name);
    return this.enabled().includes(tool.name);
  }

  setRecommended(on: boolean): void {
    this.useRecommended.set(on);
    if (!on) this.enabled.set([...this.recommended()]);
  }

  toggle(tool: CatalogTool, on: boolean): void {
    this.enabled.update((current) =>
      on ? [...current, tool.name] : current.filter((name) => name !== tool.name),
    );
  }

  apply(): void {
    this.dialogRef.close({ enabledTools: this.useRecommended() ? null : this.enabled() });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.get<{ data: CatalogTool[]; recommended: string[] }>(
          `/integrations/${this.data.integrationId}/tools`,
        ),
      );
      this.tools.set(result.data);
      this.recommended.set(result.recommended);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
