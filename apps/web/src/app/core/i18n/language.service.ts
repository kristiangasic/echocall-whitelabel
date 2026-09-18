import { DOCUMENT, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { AuthStore } from '../auth/auth.store';
import { BrandingService } from '../branding/branding.service';
import { isLanguage, type Language, type SessionUser } from '../models';

/** Which language the interface shows: the user's saved one, else the portal default, else the browser's. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly branding = inject(BrandingService);
  private readonly document = inject(DOCUMENT);

  readonly current = signal<Language>('en');

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) untracked(() => this.apply(user.language));
    });
  }

  init(): void {
    const user = this.auth.user();
    const language = user?.language ?? this.branding.branding().defaultLanguage ?? this.fromBrowser();
    this.apply(language);
    /*
     * The library fetches a language the first time something on screen wants
     * a word from it, which is after the first page has rendered: on a slow
     * line the texts then queue behind the code for those pages, and the
     * portal's first frame is empty boxes. The language is already settled
     * here, so the file can travel alongside that code instead of after it.
     * Nothing waits on this; a file that does not arrive is reported where
     * the words are missed, not from a head start nobody asked for.
     */
    this.transloco.load(language).subscribe({ error: () => undefined });
  }

  /**
   * Switches the interface and, for signed-in users, stores the choice in their
   * profile. An operator viewing the portal as a customer reads it in whichever
   * language they pick, but the customer's own saved choice stays the
   * customer's: the account refuses that write, and asking for it would only
   * fail out of sight.
   */
  async change(language: Language): Promise<void> {
    this.apply(language);
    const user = this.auth.user();
    if (!user || user.impersonator) return;
    this.auth.setUser(await firstValueFrom(this.api.patch<SessionUser>('/account/profile', { language })));
  }

  private apply(language: Language): void {
    if (this.current() === language && this.transloco.getActiveLang() === language) return;
    this.transloco.setActiveLang(language);
    this.document.documentElement.lang = language;
    this.current.set(language);
  }

  private fromBrowser(): Language {
    const code = (this.document.defaultView?.navigator.language ?? '').slice(0, 2).toLowerCase();
    return isLanguage(code) ? code : 'en';
  }
}
