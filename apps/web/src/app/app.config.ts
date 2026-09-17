import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authErrorInterceptor } from './core/api/auth-error.interceptor';
import { xhrHeaderInterceptor } from './core/api/xhr-header.interceptor';
import { AuthStore } from './core/auth/auth.store';
import { BrandingService } from './core/branding/branding.service';
import { LanguageService } from './core/i18n/language.service';
import { provideI18n } from './core/i18n/transloco.config';
import { TranslatedPaginatorIntl } from './shared/paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([xhrHeaderInterceptor, authErrorInterceptor])),
    ...provideI18n(),
    // Every table that pages reads its labels in the reader's language, not
    // only the one page that remembered to ask for it.
    { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
    provideAppInitializer(async () => {
      const branding = inject(BrandingService);
      const auth = inject(AuthStore);
      const language = inject(LanguageService);
      await Promise.all([branding.load(), auth.load()]);
      language.init();
    }),
  ],
};
