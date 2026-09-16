import { TranslocoTestingModule } from '@jsverse/transloco';
import de from '../../../public/i18n/de.json';

/** Root-scope translations preloaded in German, so specs can assert on the real texts. */
export function provideTestI18n() {
  return TranslocoTestingModule.forRoot({
    langs: { de },
    translocoConfig: { availableLangs: ['de', 'en', 'fr'], defaultLang: 'de', reRenderOnLangChange: true },
    preloadLangs: true,
  });
}

export const TEXTS = de;
