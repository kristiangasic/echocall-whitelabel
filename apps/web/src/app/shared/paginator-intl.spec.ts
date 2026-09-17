import { TestBed } from '@angular/core/testing';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideTestI18n } from '../testing/i18n';
import { providePaginatorIntl, TranslatedPaginatorIntl } from './paginator-intl';

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

  it('is what a page gets when it asks for translated labels', async () => {
    await TestBed.resetTestingModule()
      .configureTestingModule({ imports: [provideTestI18n()], providers: [providePaginatorIntl()] })
      .compileComponents();

    expect(TestBed.inject(MatPaginatorIntl)).toBeInstanceOf(TranslatedPaginatorIntl);
  });
});
