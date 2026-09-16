import { inject, Pipe, type PipeTransform } from '@angular/core';
import { LanguageService } from '../core/i18n/language.service';

/** Formats an ISO timestamp in the active interface language; impure so a language switch re-renders it. */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | null | undefined, style: 'short' | 'medium' = 'medium'): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: style,
      timeStyle: 'short',
    }).format(date);
  }
}
