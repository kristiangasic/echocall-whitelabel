import { TranslocoTestingModule } from '@jsverse/transloco';
import de from '../../../public/i18n/de.json';
import adminDe from '../../../public/i18n/admin/de.json';
import userDe from '../../../public/i18n/user/de.json';

/** Root and scoped translations preloaded in German, so specs can assert on the real texts. */
export function provideTestI18n() {
  return TranslocoTestingModule.forRoot({
    langs: { de, 'admin/de': adminDe, 'user/de': userDe },
    translocoConfig: { availableLangs: ['de', 'en', 'fr'], defaultLang: 'de', reRenderOnLangChange: true },
    preloadLangs: true,
  });
}

export const TEXTS = de;
export const ADMIN_TEXTS = adminDe;
export const USER_TEXTS = userDe;
