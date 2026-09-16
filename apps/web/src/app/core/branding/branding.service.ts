import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { Branding } from '../models';
import { brandTheme } from './color';

export const DEFAULT_BRANDING: Branding = {
  productName: 'Customer Portal',
  logoDataUrl: null,
  primaryColor: '#2563eb',
  supportEmail: null,
  imprintUrl: null,
  privacyUrl: null,
  defaultLanguage: 'de',
};

/** Loads the operator's branding once and applies it to the document: title, theme colours and favicon. */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);

  readonly branding = signal<Branding>(DEFAULT_BRANDING);
  readonly loaded = signal(false);

  async load(): Promise<Branding> {
    try {
      this.branding.set(await firstValueFrom(this.api.get<Branding>('/settings/public')));
    } catch {
      // The defaults stay until the server answers; the page still renders.
    } finally {
      this.loaded.set(true);
    }
    this.apply();
    return this.branding();
  }

  /** Used after an administrator saved new branding, so the change shows without a reload. */
  update(branding: Branding): void {
    this.branding.set(branding);
    this.apply();
  }

  apply(): void {
    const branding = this.branding();
    const root = this.document.documentElement;
    this.document.title = branding.productName;
    for (const [name, value] of Object.entries(brandTheme(branding.primaryColor))) {
      root.style.setProperty(name, value);
    }
    const icon = this.document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.href = branding.logoDataUrl ?? 'favicon.ico';
      icon.type = branding.logoDataUrl ? '' : 'image/x-icon';
    }
  }
}
