import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { AssignedIntegration, IntegrationSummary } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  IntegrationToolsDialogComponent,
  type IntegrationToolsDialogData,
  type IntegrationToolsResult,
} from '../integrations/integration-tools-dialog.component';

/**
 * Which connected services one assistant may use, and which of their tools it
 * may call. basePath is the hub path of the assistant, for example
 * /agents/agent_3 or /chatbots/7.
 */
@Component({
  selector: 'app-integrations-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-list data-testid="assigned-integrations">
        @for (entry of assigned(); track entry.id) {
          <mat-list-item>
            <mat-icon matListItemIcon>extension</mat-icon>
            <span matListItemTitle>{{ entry.name }}</span>
            <span matListItemLine>{{ t('user.integrations.modes.' + entry.toolsMode) }}</span>
            <span matListItemMeta class="entry-actions">
              <button
                mat-icon-button
                type="button"
                (click)="chooseTools(entry)"
                [attr.aria-label]="t('user.integrations.tools')"
                [attr.data-testid]="'assigned-tools-' + entry.id"
              >
                <mat-icon>handyman</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="detach(entry)"
                [attr.aria-label]="t('user.integrations.detach')"
                [attr.data-testid]="'assigned-detach-' + entry.id"
              >
                <mat-icon>link_off</mat-icon>
              </button>
            </span>
          </mat-list-item>
        } @empty {
          <p class="empty">{{ t('user.integrations.noneAssigned') }}</p>
        }
      </mat-list>

      @if (available().length) {
        <form class="attach" (ngSubmit)="attach()">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>{{ t('user.integrations.attach') }}</mat-label>
            <mat-select name="integration" [(ngModel)]="selected" data-testid="attach-integration">
              @for (integration of available(); track integration.id) {
                <mat-option [value]="integration.id">{{ integration.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button mat-stroked-button type="submit" [disabled]="selected === null || busy()">
            <mat-icon>add_link</mat-icon>
            {{ t('user.integrations.attach') }}
          </button>
        </form>
      } @else {
        <p class="empty">{{ t('user.integrations.nothingToAttach') }}</p>
      }
    </ng-container>
  `,
  styles: `
    .attach {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
      min-width: 240px;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      padding: 8px 16px;
    }
    .entry-actions {
      display: flex;
      gap: 4px;
    }
  `,
})
export class IntegrationsPanelComponent implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  /** Hub path of the assistant, for example /agents/agent_3 or /chatbots/7. */
  readonly basePath = input.required<string>();

  readonly assigned = signal<AssignedIntegration[]>([]);
  readonly all = signal<IntegrationSummary[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);

  selected: number | null = null;

  /** Only integrations that are switched on and not assigned yet can be added. */
  readonly available = computed(() => {
    const taken = new Set(this.assigned().map((entry) => entry.id));
    return this.all().filter((entry) => entry.isActive && !taken.has(entry.id));
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [assigned, all] = await Promise.all([
        firstValueFrom(this.hub.list<AssignedIntegration>(`${this.basePath()}/integrations`)),
        firstValueFrom(this.hub.get<IntegrationSummary[]>('/integrations')),
      ]);
      this.assigned.set(assigned);
      this.all.set(all);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async attach(): Promise<void> {
    const integrationId = this.selected;
    if (integrationId === null) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`${this.basePath()}/integrations`, { integrationId }));
      this.selected = null;
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async chooseTools(entry: AssignedIntegration): Promise<void> {
    const data: IntegrationToolsDialogData = {
      integrationId: entry.id,
      name: entry.name,
      selection: entry.toolsMode === 'recommended' ? null : (entry.enabledTools ?? []),
    };
    const result = await firstValueFrom(
      this.dialog
        .open<IntegrationToolsDialogComponent, IntegrationToolsDialogData, IntegrationToolsResult>(
          IntegrationToolsDialogComponent,
          { data },
        )
        .afterClosed(),
    );
    if (!result) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.hub.patch(`${this.basePath()}/integrations/${entry.id}`, {
          enabledTools: result.enabledTools,
        }),
      );
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async detach(entry: AssignedIntegration): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.delete(`${this.basePath()}/integrations/${entry.id}`));
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
