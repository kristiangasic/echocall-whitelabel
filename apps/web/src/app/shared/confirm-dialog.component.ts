import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslocoDirective } from '@jsverse/transloco';

export interface ConfirmDialogData {
  titleKey: string;
  messageKey: string;
  params?: Record<string, unknown>;
  confirmKey?: string;
  /** Renders the confirm button in the error colour for destructive actions. */
  destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t(data.titleKey, data.params) }}</h2>
      <mat-dialog-content>{{ t(data.messageKey, data.params) }}</mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>{{ t('actions.cancel') }}</button>
        <button
          mat-flat-button
          [mat-dialog-close]="true"
          [class.destructive]="data.destructive"
          cdkFocusInitial
        >
          {{ t(data.confirmKey ?? 'actions.confirm') }}
        </button>
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
