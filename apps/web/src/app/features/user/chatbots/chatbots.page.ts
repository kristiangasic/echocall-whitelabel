import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { ChatbotSummary } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { EmbedDialogComponent, type EmbedDialogData } from './embed-dialog.component';

@Component({
  selector: 'app-chatbots-page',
  imports: [
    MatTableModule,
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
        <h1 class="page-title">{{ t('user.chatbots.title') }}</h1>
        <a mat-flat-button routerLink="/app/chatbots/new" data-testid="create-chatbot">
          <mat-icon>add</mat-icon>
          {{ t('user.chatbots.create') }}
        </a>
      </div>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="table-wrap">
        <table mat-table [dataSource]="chatbots()" data-testid="chatbots-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.name') }}</th>
            <td mat-cell *matCellDef="let c" [attr.data-label]="t('fields.name')">
              <a class="row-link" [routerLink]="['/app/chatbots', c.id]">{{ c.name }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="language">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.chatbots.language') }}</th>
            <td mat-cell *matCellDef="let c" [attr.data-label]="t('user.chatbots.language')">
              {{ c.language || '' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let c" [attr.data-label]="t('fields.status')">
              <span class="status" [class]="'status status-' + c.status">
                {{ t('user.chatbots.statuses.' + c.status) }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let c" class="cell-actions">
              <button
                mat-icon-button
                type="button"
                (click)="showEmbed(c)"
                [attr.aria-label]="t('user.chatbots.embed')"
                data-testid="embed-button"
              >
                <mat-icon>code</mat-icon>
              </button>
              <a mat-icon-button [routerLink]="['/app/chatbots', c.id]" [attr.aria-label]="t('actions.edit')">
                <mat-icon>edit</mat-icon>
              </a>
              <button
                mat-icon-button
                type="button"
                (click)="remove(c)"
                [attr.aria-label]="t('actions.delete')"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ t('user.chatbots.empty') }}</td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
})
export class ChatbotsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly chatbots = signal<ChatbotSummary[]>([]);
  readonly loading = signal(false);
  readonly columns = ['name', 'language', 'status', 'actions'];

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.chatbots.set(await firstValueFrom(this.hub.list<ChatbotSummary>('/chatbots')));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  showEmbed(chatbot: ChatbotSummary): void {
    const data: EmbedDialogData = { chatbotId: chatbot.id };
    this.dialog.open(EmbedDialogComponent, { data, width: '640px' });
  }

  async remove(chatbot: ChatbotSummary): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.chatbots.deleteTitle',
      messageKey: 'user.chatbots.deleteMessage',
      params: { name: chatbot.name },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.hub.delete(`/chatbots/${chatbot.id}`));
      this.notify.success('user.chatbots.deleted');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
      this.loading.set(false);
    }
  }
}
