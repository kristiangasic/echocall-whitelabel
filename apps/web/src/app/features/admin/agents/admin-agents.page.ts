import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerChatbotRow, ResellerVoiceAgentRow } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { type AgentRow, AgentTableComponent } from './agent-table.component';

/**
 * Every agent and chatbot the customer base runs, read-only. The operator
 * cannot edit them from here, which is deliberate: they belong to the customer,
 * so the only action is opening that customer's own workspace.
 */
@Component({
  selector: 'app-admin-agents-page',
  imports: [MatCardModule, MatProgressBarModule, AgentTableComponent, TranslocoDirective],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('admin.agents.title') }}</h1>
          <p class="page-hint">{{ t('admin.agents.intro') }}</p>
        </div>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>{{ t('admin.agents.voiceAgents') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-agent-table
            data-testid="voice-agents"
            [rows]="agents()"
            [emptyText]="t('admin.agents.emptyAgents')"
            (open)="openOwner($event)"
          />
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>{{ t('admin.agents.chatbots') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-agent-table
            data-testid="chatbots"
            [rows]="chatbots()"
            [emptyText]="t('admin.agents.emptyChatbots')"
            (open)="openOwner($event)"
          />
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    .section {
      margin-bottom: 16px;
    }
  `,
})
export class AdminAgentsPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  readonly agents = signal<AgentRow[]>([]);
  readonly chatbots = signal<AgentRow[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  /**
   * Opens the portal as the customer who owns the agent. A customer without a
   * portal login cannot be opened, and the service says why, so the refusal is
   * what the operator gets to read.
   */
  async openOwner(ownerId: number): Promise<void> {
    try {
      await this.auth.impersonate(ownerId);
      await this.router.navigateByUrl('/app');
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [agents, chatbots] = await Promise.all([
        firstValueFrom(this.hub.list<ResellerVoiceAgentRow>('/resellers/voice-agents')),
        firstValueFrom(this.hub.list<ResellerChatbotRow>('/resellers/chatbots')),
      ]);
      this.agents.set(agents.map((row) => toRow(row.agent, row.owner)));
      this.chatbots.set(chatbots.map((row) => toRow(row.chatbot, row.owner)));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}

/** The stored record carries more columns than the table shows; only these are read. */
interface StoredAgent {
  id: number;
  name: string;
  language?: string | null;
  createdAt?: string | null;
  userId?: number;
}

type Owner = { id?: number; email?: string | null; name?: string | null } | null | undefined;

/**
 * The hub joins the owner onto every row, but the join can come back empty when
 * the user row is gone. Such a row still belongs in the list, it just has
 * nowhere to jump to.
 */
function toRow(record: StoredAgent, owner: Owner): AgentRow {
  return {
    id: record.id,
    name: record.name,
    language: record.language ?? null,
    createdAt: record.createdAt ?? null,
    ownerId: owner?.id ?? null,
    ownerLabel: owner?.name || owner?.email || '',
  };
}
