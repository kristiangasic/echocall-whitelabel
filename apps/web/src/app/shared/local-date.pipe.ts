import { inject, Pipe, type PipeTransform } from '@angular/core';
import { LanguageService } from '../core/i18n/language.service';

/** How much of a timestamp to show. `date` drops the time, for a day the hub stores as a day. */
export type LocalDateStyle = 'short' | 'medium' | 'date';

/** Formats an ISO timestamp in the active interface language; impure so a language switch re-renders it. */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | null | undefined, style: LocalDateStyle = 'medium'): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = this.language.current();
    // An invoice date is a day, not a moment: showing a time next to it would
    // invent a precision the hub never stored, and in another time zone it can
    // even read as the day before.
    if (style === 'date') {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: 'short' }).format(date);
  }
}
