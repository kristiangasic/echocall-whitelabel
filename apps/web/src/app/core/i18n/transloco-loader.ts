import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import { type Observable, shareReplay } from 'rxjs';

/** Loads /i18n/<lang>.json for the root scope and /i18n/<scope>/<lang>.json for feature scopes. */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  /*
   * A file is read once and then shared. Asking for a scope in the fallback
   * language makes the library ask for the scope and for its fallback, which
   * are the same file, so every first visit fetched user/en.json twice over
   * the connection it was already waiting on. Translations do not change while
   * the page is open, so holding the answer costs nothing a second request
   * would not have cost anyway.
   */
  private readonly files = new Map<string, Observable<Translation>>();

  getTranslation(lang: string): Observable<Translation> {
    const known = this.files.get(lang);
    if (known) return known;
    const file = this.http
      .get<Translation>(`/i18n/${lang}.json`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.files.set(lang, file);
    return file;
  }
}
