import adminDe from '../../../../public/i18n/admin/de.json';
import adminEn from '../../../../public/i18n/admin/en.json';
import adminFr from '../../../../public/i18n/admin/fr.json';
import de from '../../../../public/i18n/de.json';
import en from '../../../../public/i18n/en.json';
import fr from '../../../../public/i18n/fr.json';
import userDe from '../../../../public/i18n/user/de.json';
import userEn from '../../../../public/i18n/user/en.json';
import userFr from '../../../../public/i18n/user/fr.json';

const SCOPES = {
  common: { de, en, fr },
  admin: { de: adminDe, en: adminEn, fr: adminFr },
  user: { de: userDe, en: userEn, fr: userFr },
} as const;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]).sort();
}

describe('translation files', () => {
  for (const [scope, files] of Object.entries(SCOPES)) {
    it(`${scope}: de, en and fr carry the same keys and placeholders`, () => {
      const reference = flatten(files.de);
      const keys = Object.keys(reference).sort();
      expect(keys.length).toBeGreaterThan(0);
      for (const lang of ['en', 'fr'] as const) {
        const other = flatten(files[lang]);
        expect(Object.keys(other).sort(), `${scope}/${lang} keys`).toEqual(keys);
        for (const key of keys) {
          expect(other[key].trim(), `${scope}/${lang} ${key} is empty`).not.toBe('');
          expect(placeholders(other[key]), `${scope}/${lang} ${key} placeholders`).toEqual(
            placeholders(reference[key]),
          );
        }
      }
    });
  }

  it('keeps the texts customers see free of the service brand', () => {
    for (const scope of ['common', 'user'] as const) {
      for (const [lang, file] of Object.entries(SCOPES[scope])) {
        expect(JSON.stringify(file).toLowerCase(), `${scope}/${lang}`).not.toContain('echocall');
      }
    }
  });
});
