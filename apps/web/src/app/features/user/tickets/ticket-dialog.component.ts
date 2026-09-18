import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { CreateTicket } from '../../../core/hub/hub.models';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';

/** What the dialog reports back: the ticket it opened. */
export interface TicketDialogResult {
  id: string;
}

const CATEGORIES = ['technical', 'billing', 'feature', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

type Category = (typeof CATEGORIES)[number];
type Priority = (typeof PRIORITIES)[number];

@Component({
  selector: 'app-ticket-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('user.tickets.createTitle') }}</h2>
      <form (ngSubmit)="save()">
        <mat-dialog-content>
          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.tickets.subject') }}</mat-label>
            <input
              matInput
              name="subject"
              [ngModel]="subject()"
              (ngModelChange)="subject.set($event)"
              data-testid="ticket-subject"
              required
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.tickets.category') }}</mat-label>
            <mat-select
              name="category"
              [ngModel]="category()"
              (ngModelChange)="category.set($event)"
              data-testid="ticket-category"
            >
              @for (option of categories; track option) {
                <mat-option [value]="option">
                  {{ t('user.tickets.categories.' + option) }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.tickets.priority') }}</mat-label>
            <mat-select
              name="priority"
              [ngModel]="priority()"
              (ngModelChange)="priority.set($event)"
              data-testid="ticket-priority"
            >
              @for (option of priorities; track option) {
                <mat-option [value]="option">
                  {{ t('user.tickets.priorities.' + option) }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ t('user.tickets.description') }}</mat-label>
            <textarea
              matInput
              rows="6"
              name="description"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
              data-testid="ticket-description"
              required
            ></textarea>
          </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button mat-dialog-close type="button">{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="!canSave()" data-testid="ticket-save">
            {{ t('user.tickets.create') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class TicketDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<TicketDialogComponent, TicketDialogResult>>(MatDialogRef);
  private readonly hub = inject(HubService);
  private readonly notify = inject(NotifyService);

  readonly categories = CATEGORIES;
  readonly priorities = PRIORITIES;

  readonly subject = signal('');
  readonly description = signal('');
  readonly category = signal<Category>('technical');
  readonly priority = signal<Priority>('medium');
  readonly saving = signal(false);

  readonly canSave = computed(
    () => this.subject().trim().length > 0 && this.description().trim().length > 0 && !this.saving(),
  );

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    const body: CreateTicket = {
      subject: this.subject().trim(),
      description: this.description().trim(),
      category: this.category(),
      priority: this.priority(),
    };
    try {
      const created = await firstValueFrom(this.hub.post<{ id: string }>('/tickets', body));
      this.dialogRef.close({ id: created.id });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.saving.set(false);
    }
  }
}
