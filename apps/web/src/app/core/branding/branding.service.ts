import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { Branding, PublicSettings, Registration } from '../models';
import { brandTheme } from './color';

export const DEFAULT_BRANDING: Branding = {
  productName: 'Customer Portal',
  logoDataUrl: null,
  primaryColor: '#2563eb',
  supportEmail: null,
  imprintUrl: null,
  privacyUrl: null,
  defaultLanguage: 'en',
};

/** The door stays closed until the portal says otherwise. */
export const DEFAULT_REGISTRATION: Registration = { selfServiceEnabled: false };

/** Loads the operator's branding once and applies it to the document: title, theme colours and favicon. */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);

  readonly branding = signal<Branding>(DEFAULT_BRANDING);
  /** Read by the sign-in page to decide which ways in it offers. */
  readonly registration = signal<Registration>(DEFAULT_REGISTRATION);
  readonly loaded = signal(false);

  async load(): Promise<Branding> {
    try {
      const { registration, ...branding } = await firstValueFrom(
        this.api.get<PublicSettings>('/settings/public'),
      );
      this.branding.set(branding);
      this.registration.set(registration);
    } catch {
      // The defaults stay until the server answers; the page still renders.
    } finally {
      this.loaded.set(true);
    }
    this.apply();
    return this.branding();
  }

  /** Used after an administrator changed the switches, so the sign-in page follows at once. */
  setRegistration(registration: Registration): void {
    this.registration.set(registration);
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
