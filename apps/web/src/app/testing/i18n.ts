import { TranslocoTestingModule } from '@jsverse/transloco';
import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';
import fr from '../../../public/i18n/fr.json';
import adminDe from '../../../public/i18n/admin/de.json';
import adminEn from '../../../public/i18n/admin/en.json';
import adminFr from '../../../public/i18n/admin/fr.json';
import userDe from '../../../public/i18n/user/de.json';
import userEn from '../../../public/i18n/user/en.json';
import userFr from '../../../public/i18n/user/fr.json';

/**
 * Root and scoped translations, preloaded in all three languages with English
 * active, so specs assert on the real texts and a spec that wants to prove
 * something is translated can switch the active language to another one.
 */
export function provideTestI18n() {
  return TranslocoTestingModule.forRoot({
    langs: {
      en,
      de,
      fr,
      'admin/en': adminEn,
      'admin/de': adminDe,
      'admin/fr': adminFr,
      'user/en': userEn,
      'user/de': userDe,
      'user/fr': userFr,
    },
    translocoConfig: { availableLangs: ['en', 'de', 'fr'], defaultLang: 'en', reRenderOnLangChange: true },
    preloadLangs: true,
  });
}

export const TEXTS = en;
export const ADMIN_TEXTS = adminEn;
export const USER_TEXTS = userEn;

/** The same texts in German, for specs that check a translation actually takes effect. */
export const TEXTS_DE = de;
export const ADMIN_TEXTS_DE = adminDe;
