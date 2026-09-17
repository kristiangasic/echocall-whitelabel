import { inject, Injectable, type Provider } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';

/** Paginator labels in the active language. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    this.transloco.langChanges$.subscribe(() => this.refresh());
    this.transloco.events$.subscribe((event) => {
      if (event.type === 'translationLoadSuccess') this.refresh();
    });
    this.refresh();
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0)
      return this.transloco.translate('paginator.range', { from: 0, to: 0, total: length });
    const from = page * pageSize + 1;
    const to = Math.min((page + 1) * pageSize, length);
    return this.transloco.translate('paginator.range', { from, to, total: length });
  };

  private refresh(): void {
    this.itemsPerPageLabel = this.transloco.translate('paginator.itemsPerPage');
    this.nextPageLabel = this.transloco.translate('paginator.next');
    this.previousPageLabel = this.transloco.translate('paginator.previous');
    this.firstPageLabel = this.transloco.translate('paginator.first');
    this.lastPageLabel = this.transloco.translate('paginator.last');
    this.changes.next();
  }
}

/**
 * Hands one page's paginator its translated labels. Every component that shows
 * a paginator lists this, rather than the application providing it once: the
 * paginator lives in lazily loaded pages, and providing it at the root pulls
 * the whole control into the first load for readers who never reach a table.
 */
export function providePaginatorIntl(): Provider {
  return { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl };
}
