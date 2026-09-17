import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../core/i18n/language.service';
import { LocalDatePipe } from './local-date.pipe';

function pipe(language = 'de'): LocalDatePipe {
  TestBed.configureTestingModule({
    providers: [LocalDatePipe, { provide: LanguageService, useValue: { current: () => language } }],
  });
  return TestBed.inject(LocalDatePipe);
}

describe('LocalDatePipe', () => {
  it('shows a moment with its time', () => {
    const formatted = pipe().transform('2026-09-17T14:30:00.000Z');

    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('shows a day without a time', () => {
    const formatted = pipe().transform('2026-09-17T00:00:00.000Z', 'date');

    expect(formatted).toContain('2026');
    expect(formatted).not.toMatch(/\d{2}:\d{2}/);
  });

  it('keeps a day on its own date west of the meridian', () => {
    const formatted = pipe('en').transform('2026-09-17T00:00:00.000Z', 'date');

    expect(formatted).toContain('17');
  });

  it('answers with nothing for an empty or unreadable value', () => {
    const format = pipe();

    expect(format.transform(null)).toBe('');
    expect(format.transform('')).toBe('');
    expect(format.transform('not a date')).toBe('');
  });
});
