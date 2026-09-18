import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { LiveConversation, LiveMessage } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { startPolling } from '../../../core/polling/poll';
import { conversationTitle } from './conversation.model';

const POLL_INTERVAL_MS = 5000;

/**
 * Chat threads that are still open, refreshed every few seconds while the tab
 * is in front. Selecting a thread loads its messages; the reply goes straight
 * back to the visitor in the widget.
 */
@Component({
  selector: 'app-live-inbox-page',
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.inbox.title') }}</h1>
      </div>

      @if (loaded() && !threads().length) {
        <mat-card appearance="outlined" class="nothing" data-testid="inbox-nothing">
          <mat-card-content>
            <mat-icon>forum</mat-icon>
            <p class="hint">{{ t('user.inbox.empty') }}</p>
            <p class="hint">{{ t('user.inbox.emptyHint') }}</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <div class="inbox">
          <mat-card appearance="outlined" class="threads">
            <mat-card-content>
              <mat-nav-list data-testid="inbox-threads">
                @for (thread of threads(); track thread.id) {
                  <a
                    mat-list-item
                    href="#"
                    (click)="select(thread, $event)"
                    [class.selected]="thread.id === selectedId()"
                  >
                    <span matListItemTitle>{{ title(thread) }}</span>
                    <span matListItemLine>
                      {{ t('user.conversations.statuses.' + thread.status) }} &middot;
                      {{ thread.lastActivityAt || thread.startedAt | date: 'short' }}
                    </span>
                  </a>
                } @empty {
                  <p class="hint">{{ t('user.inbox.empty') }}</p>
                }
              </mat-nav-list>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined" class="thread">
            @if (selected(); as thread) {
              <mat-card-header>
                <mat-card-title>{{ title(thread) }}</mat-card-title>
                <mat-card-subtitle>{{ thread.visitorLocation || '' }}</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <ol class="messages" data-testid="inbox-messages">
                  @for (message of messages(); track message.id) {
                    <li [class]="'turn turn-' + message.senderType">
                      <span class="who">{{ senderLabel(t, message) }}</span>
                      <p class="what">{{ message.message }}</p>
                      <time>{{ message.createdAt | date: 'short' }}</time>
                    </li>
                  } @empty {
                    <p class="hint">{{ t('user.inbox.noMessages') }}</p>
                  }
                </ol>
                <form class="reply" (ngSubmit)="send()">
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>{{ t('user.inbox.reply') }}</mat-label>
                    <input matInput name="reply" [(ngModel)]="reply" data-testid="inbox-reply" />
                  </mat-form-field>
                  <button mat-flat-button type="submit" [disabled]="!reply.trim() || busy()">
                    {{ t('actions.send') }}
                  </button>
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="closeThread()"
                    [disabled]="busy()"
                    data-testid="inbox-close"
                  >
                    {{ t('user.conversations.close') }}
                  </button>
                </form>
              </mat-card-content>
            } @else {
              <mat-card-content class="blank">
                <p class="hint">{{ t('user.inbox.selectHint') }}</p>
              </mat-card-content>
            }
          </mat-card>
        </div>
      }
    </ng-container>
  `,
  styles: `
    /* A workplace, not a pair of notes: both halves stand the same height, and
       that height belongs to the workplace rather than to today's traffic. */
    .inbox {
      display: grid;
      grid-template-columns: minmax(240px, 320px) 1fr;
      gap: 16px;
      align-items: stretch;
      min-height: clamp(360px, 60vh, 640px);
    }
    .inbox > mat-card {
      display: flex;
      flex-direction: column;
    }
    .inbox > mat-card > mat-card-content {
      flex: 1;
    }
    /* Nothing to read yet, so the sentence sits in the middle of the space it
       is waiting to fill. */
    .blank {
      display: grid;
      place-items: center;
      text-align: center;
    }
    @media (max-width: 900px) {
      .inbox {
        grid-template-columns: 1fr;
        min-height: 0;
      }
    }
    .selected {
      background: var(--mat-sys-surface-container-high);
    }
    .messages {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 50vh;
      overflow-y: auto;
    }
    .turn {
      border-left: 3px solid var(--mat-sys-outline-variant);
      padding: 4px 0 4px 12px;
    }
    .turn-visitor {
      border-left-color: var(--mat-sys-primary);
    }
    .who {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .what {
      margin: 2px 0;
      white-space: pre-wrap;
    }
    .turn time {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .reply {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
      min-width: 200px;
    }
    .hint {
      margin: 0;
      padding: 8px 16px;
    }
  `,
})
export class LiveInboxPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly threads = signal<LiveConversation[]>([]);
  readonly messages = signal<LiveMessage[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly busy = signal(false);
  /** The list is only known to be empty once the service has answered once. */
  readonly loaded = signal(false);

  readonly selected = computed(
    () => this.threads().find((thread) => thread.id === this.selectedId()) ?? null,
  );

  reply = '';

  ngOnInit(): void {
    startPolling(this.destroyRef, POLL_INTERVAL_MS, () => this.refresh());
    void this.refresh();
  }

  title(thread: LiveConversation): string {
    return conversationTitle(thread);
  }

  senderLabel(t: (key: string) => string, message: LiveMessage): string {
    return message.senderName || t(`user.conversations.senders.${message.senderType}`);
  }

  select(thread: LiveConversation, event: Event): void {
    event.preventDefault();
    this.selectedId.set(thread.id);
    void this.loadMessages();
  }

  async send(): Promise<void> {
    const message = this.reply.trim();
    const id = this.selectedId();
    if (!message || id === null) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`/conversations/${id}/messages`, { message }));
      this.reply = '';
      await this.loadMessages();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async closeThread(): Promise<void> {
    const id = this.selectedId();
    if (id === null) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`/conversations/${id}/close`));
      this.notify.success('user.conversations.closed');
      this.selectedId.set(null);
      this.messages.set([]);
      await this.refresh();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  /** Open threads first; closed ones drop out of the inbox. */
  async refresh(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.page<LiveConversation>('/conversations', { type: 'chat', perPage: 50 }),
      );
      this.threads.set(result.data.filter((thread) => thread.status !== 'closed'));
      this.loaded.set(true);
      if (this.selectedId() !== null) await this.loadMessages();
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  private async loadMessages(): Promise<void> {
    const id = this.selectedId();
    if (id === null) return;
    try {
      const result = await firstValueFrom(
        this.hub.page<LiveMessage>(`/conversations/${id}/messages`, { perPage: 100 }),
      );
      this.messages.set(result.data);
    } catch (err) {
      this.notify.apiError(err);
    }
  }
}
