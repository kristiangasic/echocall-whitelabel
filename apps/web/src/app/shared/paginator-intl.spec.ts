import { MatPaginatorIntl } from '@angular/material/paginator';
import { TestBed } from '@angular/core/testing';
import { appConfig } from '../app.config';
import { provideTestI18n } from '../testing/i18n';
import { TranslatedPaginatorIntl } from './paginator-intl';

describe('TranslatedPaginatorIntl', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [provideTestI18n()],
      providers: [TranslatedPaginatorIntl],
    }).compileComponents();
  });

  it('labels the controls in the reader language', () => {
    const intl = TestBed.inject(TranslatedPaginatorIntl);

    expect(intl.itemsPerPageLabel).toBe('Einträge pro Seite');
    expect(intl.nextPageLabel).toBe('Nächste Seite');
    expect(intl.previousPageLabel).toBe('Vorherige Seite');
  });

  it('reads the range as a sentence, empty pages included', () => {
    const intl = TestBed.inject(TranslatedPaginatorIntl);

    expect(intl.getRangeLabel(1, 25, 60)).toBe('26 bis 50 von 60');
    expect(intl.getRangeLabel(0, 25, 0)).toBe('0 bis 0 von 0');
  });

  it('is what the application hands every paginator', () => {
    const provider = appConfig.providers
      .flat()
      .find((entry) => typeof entry === 'object' && 'provide' in entry && entry.provide === MatPaginatorIntl);

    expect(provider).toEqual({ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl });
  });
});
