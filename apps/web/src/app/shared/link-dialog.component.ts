import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

export interface LinkDialogData {
  titleKey: string;
  messageKey: string;
  link: string;
}

/** Shows a one-time link the administrator has to pass on by hand because no mail server is configured. */
@Component({
  selector: 'app-link-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t(data.titleKey) }}</h2>
      <mat-dialog-content>
        <p>{{ t(data.messageKey) }}</p>
        <code class="link" data-testid="one-time-link">{{ data.link }}</code>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button (click)="copy()">
          <mat-icon>content_copy</mat-icon>
          {{ t(copied() ? 'actions.copied' : 'actions.copy') }}
        </button>
        <button mat-flat-button mat-dialog-close cdkFocusInitial>{{ t('actions.close') }}</button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .link {
      display: block;
      padding: 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
      word-break: break-all;
      user-select: all;
      font: var(--mat-sys-body-small);
    }
  `,
})
export class LinkDialogComponent {
  readonly data = inject<LinkDialogData>(MAT_DIALOG_DATA);
  private readonly clipboard = inject(Clipboard);
  readonly copied = signal(false);

  copy(): void {
    this.copied.set(this.clipboard.copy(this.data.link));
  }
}
