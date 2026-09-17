import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { AgentSummary } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { parseRecipients } from './campaign-recipients';

/** What the dialog reports back: the campaign it created. */
export interface CampaignDialogResult {
  id: number;
}

@Component({
  selector: 'app-campaign-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('user.campaigns.createTitle') }}</h2>
      <mat-dialog-content>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <form class="fields">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.campaigns.name') }}</mat-label>
            <input
              matInput
              name="name"
              [ngModel]="name()"
              (ngModelChange)="name.set($event)"
              data-testid="campaign-name"
              required
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.campaigns.agent') }}</mat-label>
            <mat-select
              name="agent"
              [ngModel]="agentId()"
              (ngModelChange)="agentId.set($event)"
              data-testid="campaign-agent"
              required
            >
              @for (agent of agents(); track agent.id) {
                <mat-option [value]="agent.id">{{ agent.name }}</mat-option>
              }
            </mat-select>
            @if (!loading() && agents().length === 0) {
              <mat-hint>{{ t('user.campaigns.noAgents') }}</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.campaigns.recipients') }}</mat-label>
            <textarea
              matInput
              rows="8"
              name="recipients"
              [ngModel]="recipients()"
              (ngModelChange)="recipients.set($event)"
              placeholder="+49301234567, Maria Beispiel"
              data-testid="campaign-recipients"
            ></textarea>
            <mat-hint>{{ t('user.campaigns.recipientsHint') }}</mat-hint>
          </mat-form-field>

          <p class="count" data-testid="campaign-count">
            {{ t('user.campaigns.recipientCount', { count: parsed().length }) }}
          </p>
        </form>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
        <button
          mat-flat-button
          type="button"
          (click)="save()"
          [disabled]="!canSave()"
          data-testid="campaign-save"
        >
          {{ t('user.campaigns.create') }}
        </button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(480px, 80vw);
      padding-top: 8px;
    }
    .count {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
  `,
})
export class CampaignDialogComponent implements OnInit {
  private readonly dialogRef =
    inject<MatDialogRef<CampaignDialogComponent, CampaignDialogResult>>(MatDialogRef);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);

  readonly agents = signal<AgentSummary[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly name = signal('');
  readonly agentId = signal<string | null>(null);
  readonly recipients = signal('');

  readonly parsed = computed(() => parseRecipients(this.recipients()));
  readonly canSave = computed(
    () =>
      this.name().trim().length > 0 && this.agentId() !== null && this.parsed().length > 0 && !this.saving(),
  );

  ngOnInit(): void {
    void this.loadAgents();
  }

  async save(): Promise<void> {
    const agentId = this.agentId();
    if (!this.canSave() || agentId === null) return;
    this.saving.set(true);
    try {
      const created = await firstValueFrom(
        this.hub.post<{ id: number }>('/batch-calling/campaigns', {
          name: this.name().trim(),
          agentId,
          recipients: this.parsed(),
        }),
      );
      this.dialogRef.close({ id: created.id });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadAgents(): Promise<void> {
    this.loading.set(true);
    try {
      this.agents.set(await firstValueFrom(this.hub.list<AgentSummary>('/agents')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
