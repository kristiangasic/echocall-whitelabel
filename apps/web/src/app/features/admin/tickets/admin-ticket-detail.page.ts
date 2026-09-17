import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerTicketDetail, ResellerTicketMessage } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** The states the hub stores on a ticket; the picker offers them and nothing else. */
const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;

/** Roles that answer from the operator's side of the conversation. */
const OPERATOR_ROLES = ['admin', 'reseller'];

/**
 * One support request with its whole conversation. This is where the operator
 * answers: a public reply goes to the customer and moves the ticket to waiting,
 * an internal note stays in the portal, and a request that is beyond the
 * operator can be handed to the support of the platform they resell.
 */
@Component({
  selector: 'app-admin-ticket-detail-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ ticket()?.subject || t('admin.tickets.title') }}</h1>
          @if (customerName(); as name) {
            <p class="page-hint">{{ name }}</p>
          }
        </div>
        <a mat-stroked-button routerLink="/admin/tickets">
          <mat-icon>arrow_back</mat-icon>
          {{ t('actions.back') }}
        </a>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (missing()) {
        <p class="empty" data-testid="missing">{{ t('admin.tickets.detail.missing') }}</p>
      }

      @if (ticket(); as detail) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <dl class="facts">
              <div>
                <dt>{{ t('fields.status') }}</dt>
                <dd data-testid="ticket-status">{{ t('admin.tickets.statuses.' + detail.status) }}</dd>
              </div>
              <div>
                <dt>{{ t('admin.tickets.priority') }}</dt>
                <dd>{{ t('admin.tickets.priorities.' + detail.priority) }}</dd>
              </div>
              <div>
                <dt>{{ t('admin.tickets.category') }}</dt>
                <dd>{{ t('admin.tickets.categories.' + detail.category) }}</dd>
              </div>
              <div>
                <dt>{{ t('admin.tickets.created') }}</dt>
                <dd>{{ detail.createdAt | localDate }}</dd>
              </div>
            </dl>
            <h2 class="section">{{ t('admin.tickets.detail.description') }}</h2>
            <p class="description">{{ detail.description }}</p>
          </mat-card-content>
        </mat-card>

        <div class="controls">
          <mat-form-field appearance="outline">
            <mat-label>{{ t('admin.tickets.detail.setStatus') }}</mat-label>
            <mat-select [value]="detail.status" (valueChange)="setStatus($event)" data-testid="status-select">
              @for (name of statuses; track name) {
                <mat-option [value]="name">{{ t('admin.tickets.statuses.' + name) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (escalated()) {
            <p class="hint" data-testid="escalated">{{ t('admin.tickets.detail.escalatedHint') }}</p>
          } @else {
            <button mat-stroked-button type="button" (click)="escalate()" data-testid="escalate">
              <mat-icon>support_agent</mat-icon>
              {{ t('admin.tickets.detail.escalate') }}
            </button>
          }
        </div>

        <h2 class="section">{{ t('admin.tickets.detail.thread') }}</h2>
        <div class="thread">
          @for (message of messages(); track message.id) {
            <div
              class="message"
              [class.operator]="isOperator(message)"
              [class.internal]="message.isInternal"
              data-testid="message"
            >
              <div class="meta">
                <span>{{ t(senderLabel(message)) }}</span>
                <span>{{ message.createdAt | localDate: 'short' }}</span>
              </div>
              @if (message.isInternal) {
                <span class="badge">{{ t('admin.tickets.detail.internalBadge') }}</span>
              }
              <p class="text">{{ message.message }}</p>
            </div>
          } @empty {
            <p class="empty">{{ t('admin.tickets.detail.noMessages') }}</p>
          }
        </div>

        <form class="reply" (ngSubmit)="send()">
          <mat-form-field appearance="outline" class="reply-field">
            <mat-label>{{ t('admin.tickets.detail.reply') }}</mat-label>
            <textarea
              matInput
              rows="3"
              name="reply"
              [ngModel]="reply()"
              (ngModelChange)="reply.set($event)"
              data-testid="reply"
            ></textarea>
          </mat-form-field>
          <div class="reply-side">
            <mat-checkbox
              name="internal"
              [ngModel]="internal()"
              (ngModelChange)="internal.set($event)"
              data-testid="internal"
            >
              {{ t('admin.tickets.detail.internalToggle') }}
            </mat-checkbox>
            <p class="hint">{{ t('admin.tickets.detail.internalHint') }}</p>
            <button mat-flat-button type="submit" [disabled]="!canSend()" data-testid="send">
              <mat-icon>send</mat-icon>
              {{ t('actions.send') }}
            </button>
          </div>
        </form>
      }
    </ng-container>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin: 0;
    }
    .facts dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .facts dd {
      margin: 4px 0 0;
      font: var(--mat-sys-title-small);
    }
    .section {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 8px;
    }
    .description {
      margin: 0;
      white-space: pre-wrap;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      margin-top: 16px;
    }
    .controls mat-form-field {
      width: 240px;
      max-width: 100%;
    }
    .thread {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 12px 16px;
      background: var(--mat-sys-surface-container-low);
      max-width: min(680px, 100%);
    }
    .message.operator {
      align-self: flex-end;
      background: var(--mat-sys-primary-container);
    }
    .message.internal {
      background: var(--mat-sys-surface-container-high);
      border-style: dashed;
    }
    .meta {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .badge {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .text {
      margin: 6px 0 0;
      white-space: pre-wrap;
    }
    .reply {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
      margin-top: 24px;
    }
    .reply-field {
      flex: 1 1 320px;
    }
    .reply-side {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .hint,
    .empty {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      max-width: 40ch;
    }
    .empty {
      font: var(--mat-sys-body-medium);
      padding: 16px 0;
    }
  `,
})
export class AdminTicketDetailPage implements OnInit {
  private readonly hub = inject(AdminHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly statuses = STATUSES;
  readonly id = signal('');
  readonly detail = signal<ResellerTicketDetail | null>(null);
  readonly loading = signal(false);
  readonly missing = signal(false);
  readonly sending = signal(false);
  readonly reply = signal('');
  readonly internal = signal(false);

  readonly ticket = computed(() => this.detail()?.ticket ?? null);
  readonly messages = computed(() => this.detail()?.messages ?? []);
  readonly escalated = computed(() => Boolean(this.ticket()?.assignedToAdmin));
  readonly canSend = computed(() => this.reply().trim().length > 0 && !this.sending());

  /** The customer as the hub knows them, or their id when it carries no name. */
  readonly customerName = computed(() => {
    const detail = this.detail();
    if (!detail) return '';
    return detail.customer?.name || detail.customer?.email || String(detail.ticket?.userId ?? '');
  });

  ngOnInit(): void {
    this.id.set(this.route.snapshot.paramMap.get('id') ?? '');
    void this.load();
  }

  isOperator(message: ResellerTicketMessage): boolean {
    return OPERATOR_ROLES.includes(message.sender?.role ?? '');
  }

  /**
   * Names the writer by their side of the conversation rather than by the name
   * the hub carries: the operator reads their own replies as their team's, and
   * everything from the other side as the customer.
   */
  senderLabel(message: ResellerTicketMessage): string {
    if (!message.sender?.id) return 'admin.tickets.detail.system';
    return this.isOperator(message) ? 'admin.tickets.detail.operator' : 'admin.tickets.detail.customerSide';
  }

  /**
   * Posts what was typed. A public reply moves the ticket to waiting at the hub
   * and reaches the customer; an internal note changes no status and stays in
   * the portal, which is why the thread is read again either way.
   */
  async send(): Promise<void> {
    if (!this.canSend()) return;
    const isInternal = this.internal();
    this.sending.set(true);
    try {
      await firstValueFrom(
        this.hub.post(`/resellers/tickets/${this.id()}/reply`, {
          message: this.reply().trim(),
          isInternal,
        }),
      );
      this.reply.set('');
      this.internal.set(false);
      this.notify.success(isInternal ? 'admin.tickets.detail.noteSaved' : 'admin.tickets.detail.sent');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.sending.set(false);
    }
  }

  /** The hub takes any status from any other, so this writes exactly what was picked. */
  async setStatus(status: string): Promise<void> {
    if (!status || status === this.ticket()?.status) return;
    try {
      await firstValueFrom(this.hub.patch(`/resellers/tickets/${this.id()}`, { status }));
      this.notify.success('admin.tickets.detail.statusChanged');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    }
  }

  /**
   * Hands the request to the support of the platform operator. It leaves the
   * operator's hands and reopens the ticket, so the confirmation says both
   * before anything is sent.
   */
  escalate(): void {
    const data: ConfirmDialogData = {
      titleKey: 'admin.tickets.detail.escalateTitle',
      messageKey: 'admin.tickets.detail.escalateMessage',
      params: { subject: this.ticket()?.subject ?? '' },
      confirmKey: 'admin.tickets.detail.escalate',
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await firstValueFrom(this.hub.post(`/resellers/tickets/${this.id()}/escalate`));
          this.notify.success('admin.tickets.detail.escalateDone');
          await this.load();
        } catch (err) {
          this.notify.apiError(err);
        }
      });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.detail.set(
        await firstValueFrom(this.hub.get<ResellerTicketDetail>(`/resellers/tickets/${this.id()}`)),
      );
      this.missing.set(false);
    } catch (err) {
      // A ticket that is not there is the page's own answer, not an alarm: the
      // operator followed a link to something that was deleted meanwhile.
      if ((err as { status?: number }).status === 404) this.missing.set(true);
      else this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
