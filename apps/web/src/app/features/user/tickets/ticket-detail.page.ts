import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { Ticket, TicketMessage } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** Roles that answer a ticket from the operator's side. */
const SUPPORT_ROLES = ['admin', 'reseller'];

@Component({
  selector: 'app-ticket-detail-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    RouterLink,
    LocalDatePipe,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ ticket()?.subject || t('user.tickets.title') }}</h1>
        <a mat-stroked-button routerLink="/app/tickets">
          <mat-icon>arrow_back</mat-icon>
          {{ t('actions.back') }}
        </a>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (ticket(); as ticketDetail) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <dl class="facts inline">
              <div>
                <dt>{{ t('fields.status') }}</dt>
                <dd data-testid="ticket-status">
                  {{ t('user.tickets.statuses.' + ticketDetail.status) }}
                </dd>
              </div>
              @if (ticketDetail.priority; as priority) {
                <div>
                  <dt>{{ t('user.tickets.priority') }}</dt>
                  <dd>{{ t('user.tickets.priorities.' + priority) }}</dd>
                </div>
              }
              @if (ticketDetail.category; as category) {
                <div>
                  <dt>{{ t('user.tickets.category') }}</dt>
                  <dd>{{ t('user.tickets.categories.' + category) }}</dd>
                </div>
              }
              <div>
                <dt>{{ t('user.tickets.opened') }}</dt>
                <dd>{{ ticketDetail.createdAt | localDate }}</dd>
              </div>
            </dl>
            @if (ticketDetail.description) {
              <p class="description" data-testid="ticket-description">
                {{ ticketDetail.description }}
              </p>
            }
          </mat-card-content>
        </mat-card>
      }

      <div class="thread" data-testid="ticket-thread">
        @for (message of messages(); track message.id) {
          <div class="message" [class.support]="isSupport(message)">
            <div class="meta">
              <span class="sender">{{ t(senderLabel(message)) }}</span>
              <span class="time">{{ message.createdAt | localDate: 'short' }}</span>
            </div>
            <p class="text">{{ message.message }}</p>
          </div>
        } @empty {
          <p class="empty">{{ t('user.tickets.noMessages') }}</p>
        }
      </div>

      @if (canReply()) {
        <form class="reply" (ngSubmit)="send()">
          <mat-form-field appearance="outline" class="reply-field">
            <mat-label>{{ t('user.tickets.reply') }}</mat-label>
            <textarea
              matInput
              rows="3"
              name="reply"
              [ngModel]="reply()"
              (ngModelChange)="reply.set($event)"
              data-testid="ticket-reply"
            ></textarea>
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="!canSend()" data-testid="ticket-send">
            <mat-icon>send</mat-icon>
            {{ t('actions.send') }}
          </button>
        </form>
      } @else {
        <p class="closed-hint" data-testid="ticket-closed">{{ t('user.tickets.closedHint') }}</p>
      }
    </ng-container>
  `,
  styles: `
    .description {
      margin: 16px 0 0;
      white-space: pre-wrap;
    }
    .thread {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 24px 0;
    }
    .message {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 12px 16px;
      background: var(--mat-sys-surface-container-low);
      max-width: min(680px, 100%);
    }
    .message.support {
      align-self: flex-end;
      background: var(--mat-sys-primary-container);
    }
    .meta {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .text {
      margin: 6px 0 0;
      white-space: pre-wrap;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .reply {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .reply-field {
      flex: 1;
    }
    .closed-hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TicketDetailPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotifyService);

  readonly id = signal('');
  readonly ticket = signal<Ticket | null>(null);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly reply = signal('');

  readonly messages = computed(() => this.ticket()?.messages ?? []);
  readonly canReply = computed(() => {
    const status = this.ticket()?.status;
    return status !== undefined && status !== 'closed';
  });
  readonly canSend = computed(() => this.reply().trim().length > 0 && !this.sending());

  ngOnInit(): void {
    this.id.set(this.route.snapshot.paramMap.get('id') ?? '');
    void this.load();
  }

  isSupport(message: TicketMessage): boolean {
    return SUPPORT_ROLES.includes(message.sender.role ?? '');
  }

  /**
   * Names the writer of a message by their side of the thread, never by the name
   * the hub carries for them: the customer reads their own replies as theirs,
   * and everything from the operator side reads as support.
   */
  senderLabel(message: TicketMessage): string {
    return this.isSupport(message) ? 'user.tickets.support' : 'user.tickets.you';
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;
    this.sending.set(true);
    try {
      await firstValueFrom(this.hub.post(`/tickets/${this.id()}/messages`, { message: this.reply().trim() }));
      this.reply.set('');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.sending.set(false);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.ticket.set(await firstValueFrom(this.hub.get<Ticket>(`/tickets/${this.id()}`)));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
