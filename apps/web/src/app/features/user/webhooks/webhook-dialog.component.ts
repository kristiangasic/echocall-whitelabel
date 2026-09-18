import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { Webhook, WebhookEvent } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { parseEvents, WILDCARD } from './webhook-events';

/** Opened without an endpoint to register one, with one to change it. */
export interface WebhookDialogData {
  webhook?: Webhook;
}

/** A new endpoint, with the signing secret the service returns exactly once. */
export interface WebhookDialogResult {
  created: boolean;
  secret?: string;
}

/**
 * Registers or edits one outbound endpoint. The signing secret is shown to
 * the caller of this dialog, because the service never returns it again.
 */
@Component({
  selector: 'app-webhook-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{ t(isNew() ? 'user.webhooks.createTitle' : 'user.webhooks.editTitle') }}
      </h2>
      <form (ngSubmit)="save()">
        <mat-dialog-content class="fields">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.webhooks.url') }}</mat-label>
            <input
              matInput
              type="url"
              name="url"
              [ngModel]="url()"
              (ngModelChange)="url.set($event)"
              placeholder="https://example.com/hooks/echo"
              data-testid="webhook-url"
              required
            />
          </mat-form-field>

          <p class="hint">{{ t('user.webhooks.eventsHint') }}</p>
          <mat-checkbox [checked]="all()" (change)="setAll($event.checked)" data-testid="webhook-all-events">
            {{ t('user.webhooks.allEvents') }}
          </mat-checkbox>
          <div class="events">
            @for (event of catalog(); track event.event) {
              <mat-checkbox
                [checked]="isSelected(event.event)"
                [disabled]="all()"
                (change)="toggle(event.event, $event.checked)"
                [attr.data-testid]="'webhook-event-' + event.event"
              >
                <span class="event">{{ event.event }}</span>
                <span class="description">{{ eventDescription(event) }}</span>
              </mat-checkbox>
            }
          </div>

          @if (!isNew()) {
            <mat-slide-toggle name="active" [(ngModel)]="active" data-testid="webhook-active">
              {{ t('user.webhooks.active') }}
            </mat-slide-toggle>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="!canSave()" data-testid="webhook-save">
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
      gap: 8px;
      min-width: 320px;
    }
    .events {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-left: 8px;
    }
    .event {
      font-family: monospace;
    }
    .description {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .hint {
      margin: 8px 0 0;
    }
  `,
})
export class WebhookDialogComponent implements OnInit {
  readonly data = inject<WebhookDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<WebhookDialogComponent, WebhookDialogResult>>(MatDialogRef);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);

  readonly catalog = signal<WebhookEvent[]>([]);
  readonly wildcard = signal(WILDCARD);
  readonly events = signal<string[]>([]);
  readonly all = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly url = signal('');
  active = true;

  readonly isNew = computed(() => this.data.webhook === undefined);
  readonly canSave = computed(
    () => this.url().trim().length > 0 && (this.all() || this.events().length > 0) && !this.saving(),
  );

  ngOnInit(): void {
    const webhook = this.data.webhook;
    if (webhook) {
      this.url.set(webhook.url);
      this.active = webhook.isActive;
      const subscribed = parseEvents(webhook.events);
      this.all.set(subscribed.includes(WILDCARD));
      this.events.set(subscribed.filter((event) => event !== WILDCARD));
    }
    void this.loadCatalog();
  }

  /**
   * Explains an event in the reader's language. The service documents its
   * events in English for developers; a customer picking deliveries in the
   * portal reads their own. An event the portal has no wording for yet keeps
   * the service's own sentence rather than showing nothing.
   */
  eventDescription(event: WebhookEvent): string {
    const key = `user.webhooks.eventTexts.${event.event.replaceAll('.', '_')}`;
    const text = this.transloco.translate(key);
    return text === key ? event.description : text;
  }

  isSelected(event: string): boolean {
    return this.all() || this.events().includes(event);
  }

  setAll(on: boolean): void {
    this.all.set(on);
  }

  toggle(event: string, on: boolean): void {
    this.events.update((current) => (on ? [...current, event] : current.filter((name) => name !== event)));
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const events = this.all() ? [this.wildcard()] : this.events();
    this.saving.set(true);
    try {
      if (this.isNew()) {
        const created = await firstValueFrom(
          this.hub.post<{ id: number; secret: string }>('/webhooks', { url: this.url().trim(), events }),
        );
        this.dialogRef.close({ created: true, secret: created.secret });
      } else {
        await firstValueFrom(
          this.hub.patch(`/webhooks/${this.data.webhook?.id}`, {
            url: this.url().trim(),
            events,
            isActive: this.active,
          }),
        );
        this.notify.success('user.webhooks.saved');
        this.dialogRef.close({ created: false });
      }
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadCatalog(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.get<{ data: WebhookEvent[]; wildcard: string }>('/webhooks/events'),
      );
      this.catalog.set(result.data);
      this.wildcard.set(result.wildcard);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
