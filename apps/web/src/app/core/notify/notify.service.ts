import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { readApiError } from '../errors/api-error';

type Params = Record<string, unknown>;

/** Snack-bar messages; keys are translated with the root scope. */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  success(key: string, params?: Params): void {
    this.open(this.transloco.translate(key, params), 4000, 'notify-success');
  }

  error(key: string, params?: Params): void {
    this.open(this.transloco.translate(key, params), 7000, 'notify-error');
  }

  apiError(error: unknown): void {
    this.error(this.errorKey(readApiError(error).code));
  }

  /** `errors.<code>` when the active language has a text for it, otherwise `errors.unknown`. */
  errorKey(code: string): string {
    const key = `errors.${code}`;
    const translation = this.transloco.getTranslation(this.transloco.getActiveLang());
    return key in translation ? key : 'errors.unknown';
  }

  private open(message: string, duration: number, panelClass: string): void {
    this.snackBar.open(message, this.transloco.translate('actions.close'), { duration, panelClass });
  }
}
