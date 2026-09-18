import { TestBed } from '@angular/core/testing';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';
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

    expect(intl.itemsPerPageLabel).toBe('Items per page');
    expect(intl.nextPageLabel).toBe('Next page');
    expect(intl.previousPageLabel).toBe('Previous page');

    // The labels follow the reader, they are not English strings in the code.
    TestBed.inject(TranslocoService).setActiveLang('de');
    expect(intl.itemsPerPageLabel).toBe('Einträge pro Seite');
    expect(intl.nextPageLabel).toBe('Nächste Seite');
  });

  it('reads the range as a sentence, empty pages included', () => {
    const intl = TestBed.inject(TranslatedPaginatorIntl);

    expect(intl.getRangeLabel(1, 25, 60)).toBe('26 to 50 of 60');
    expect(intl.getRangeLabel(0, 25, 0)).toBe('0 to 0 of 0');
  });

  it('is what a page gets when it asks for translated labels', async () => {
    await TestBed.resetTestingModule()
      .configureTestingModule({ imports: [provideTestI18n()], providers: [providePaginatorIntl()] })
      .compileComponents();

    expect(TestBed.inject(MatPaginatorIntl)).toBeInstanceOf(TranslatedPaginatorIntl);
  });
});
