import { DatePipe } from '@angular/common';
import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { ConversationTranscriptMessage } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { conversationTitle, isChat, type AnyConversation } from './conversation.model';

type ConversationDetail = AnyConversation & { messages?: ConversationTranscriptMessage[] };

@Component({
  selector: 'app-conversation-detail-page',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ heading() }}</h1>
        <div class="head-actions">
          @if (canClose()) {
            <button mat-stroked-button type="button" (click)="close()" data-testid="close-conversation">
              <mat-icon>done_all</mat-icon>
              {{ t('user.conversations.close') }}
            </button>
          }
          <a mat-stroked-button routerLink="/app/conversations">
            <mat-icon>arrow_back</mat-icon>
            {{ t('actions.back') }}
          </a>
        </div>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (conversation(); as c) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <dl class="facts inline">
              <div>
                <dt>{{ t('fields.status') }}</dt>
                <dd data-testid="conversation-status">{{ c.status || '' }}</dd>
              </div>
              <div>
                <dt>{{ t('user.conversations.started') }}</dt>
                <dd>{{ (c.startedAt || c.createdAt | date: 'medium') || '' }}</dd>
              </div>
              <div>
                <dt>{{ t('user.conversations.duration') }}</dt>
                <dd>{{ duration(c.duration) }}</dd>
              </div>
              @if (!isChatThread()) {
                <div>
                  <dt>{{ t('user.conversations.direction') }}</dt>
                  <dd>{{ t('user.conversations.directions.' + direction()) }}</dd>
                </div>
              }
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" class="transcript-card">
          <mat-card-header>
            <mat-card-title>{{ t('user.conversations.transcript') }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (messages().length) {
              <ol class="transcript" data-testid="transcript">
                @for (message of messages(); track message.id) {
                  <li [class]="'turn turn-' + message.senderType">
                    <span class="who">{{ senderLabel(t, message) }}</span>
                    <p class="what">{{ message.message }}</p>
                    <time>{{ message.createdAt | date: 'short' }}</time>
                  </li>
                }
              </ol>
            } @else if (plainTranscript()) {
              <pre class="plain" data-testid="transcript">{{ plainTranscript() }}</pre>
            } @else {
              <p class="hint">{{ t('user.conversations.noTranscript') }}</p>
            }
          </mat-card-content>
        </mat-card>
      }
    </ng-container>
  `,
  styles: `
    .head-actions {
      display: flex;
      gap: 8px;
    }
    .transcript-card {
      margin-top: 24px;
    }
    .transcript {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
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
    .plain {
      white-space: pre-wrap;
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
    .hint {
      margin: 0;
    }
  `,
})
export class ConversationDetailPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotifyService);

  readonly id = signal<number | null>(null);
  readonly conversation = signal<ConversationDetail | null>(null);
  readonly loading = signal(false);

  readonly isChatThread = computed(() => {
    const c = this.conversation();
    return c !== null && isChat(c);
  });
  readonly messages = computed(() => this.conversation()?.messages ?? []);
  readonly canClose = computed(() => {
    const c = this.conversation();
    return c !== null && isChat(c) && c.status !== 'closed';
  });
  readonly heading = computed(() => {
    const c = this.conversation();
    return c ? conversationTitle(c) : '';
  });
  readonly direction = computed(() => {
    const c = this.conversation();
    return c && !isChat(c) ? c.direction : 'inbound';
  });
  readonly plainTranscript = computed(() => {
    const c = this.conversation();
    return c && !isChat(c) ? (c.transcription ?? '') : '';
  });

  ngOnInit(): void {
    this.id.set(Number(this.route.snapshot.paramMap.get('id')));
    void this.load();
  }

  senderLabel(t: (key: string) => string, message: ConversationTranscriptMessage): string {
    return message.senderName || t(`user.conversations.senders.${message.senderType}`);
  }

  duration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.conversation.set(
        await firstValueFrom(this.hub.get<ConversationDetail>(`/conversations/${this.id()}`)),
      );
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async close(): Promise<void> {
    this.loading.set(true);
    try {
      await firstValueFrom(this.hub.post(`/conversations/${this.id()}/close`));
      this.notify.success('user.conversations.closed');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
      this.loading.set(false);
    }
  }
}
