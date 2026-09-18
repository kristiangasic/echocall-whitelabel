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
    this.apply(user?.language ?? this.branding.branding().defaultLanguage ?? this.fromBrowser());
  }

  /** Switches the interface and, for signed-in users, stores the choice in their profile. */
  async change(language: Language): Promise<void> {
    this.apply(language);
    if (this.auth.user()) {
      this.auth.setUser(await firstValueFrom(this.api.patch<SessionUser>('/account/profile', { language })));
    }
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
