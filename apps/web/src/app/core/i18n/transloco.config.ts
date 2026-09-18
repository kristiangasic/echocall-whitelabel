import { type EnvironmentProviders, isDevMode, type Provider } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { LANGUAGES } from '../models';
import { TranslocoHttpLoader } from './transloco-loader';

/** Root scope in public/i18n/<lang>.json; features add their own scope with provideTranslocoScope. */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return provideTransloco({
    config: {
      availableLangs: [...LANGUAGES],
      defaultLang: 'en',
      fallbackLang: 'en',
      missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: TranslocoHttpLoader,
  });
}
