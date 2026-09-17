import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { NotifyService } from '../../../core/notify/notify.service';

export interface EmbedDialogData {
  chatbotId: number;
}

/**
 * Shows the snippet a customer pastes into their own site. The script is
 * served by this portal under /embed, so the visitor never talks to anyone
 * but the operator's own domain.
 */
@Component({
  selector: 'app-embed-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoDirective],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('user.chatbots.embedTitle') }}</h2>
      <mat-dialog-content>
        <p>{{ t('user.chatbots.embedHint') }}</p>
        <pre data-testid="embed-snippet">{{ snippet }}</pre>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">{{ t('actions.close') }}</button>
        <button mat-flat-button type="button" (click)="copy()" data-testid="embed-copy">
          <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
          {{ t('actions.copy') }}
        </button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    pre {
      background: var(--mat-sys-surface-container-high);
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
      font-size: 13px;
      margin: 0;
    }
  `,
})
export class EmbedDialogComponent {
  private readonly data = inject<EmbedDialogData>(MAT_DIALOG_DATA);
  private readonly notify = inject(NotifyService);

  readonly copied = signal(false);
  readonly snippet = `<script src="${location.origin}/embed/chat.js" data-id="${this.data.chatbotId}" async></script>`;

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.snippet);
      this.copied.set(true);
      this.notify.success('user.chatbots.embedCopied');
    } catch {
      this.notify.error('user.chatbots.embedCopyFailed');
    }
  }
}
