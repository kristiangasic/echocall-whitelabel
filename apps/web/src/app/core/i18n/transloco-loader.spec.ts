import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  let http: HttpTestingController;
  let loader: TranslocoHttpLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(TranslocoHttpLoader);
  });

  afterEach(() => http.verify());

  it('reads the root scope from the language file', () => {
    let seen: unknown;
    loader.getTranslation('de').subscribe((t) => (seen = t));

    const req = http.expectOne('/i18n/de.json');
    req.flush({ 'actions.save': 'Speichern' });

    expect(seen).toEqual({ 'actions.save': 'Speichern' });
  });

  it('reads a feature scope from its own folder', () => {
    loader.getTranslation('user/fr').subscribe();

    http.expectOne('/i18n/user/fr.json').flush({});
  });

  /*
   * Asking for a scope in the fallback language makes the library request the
   * scope and its fallback, which are then the same file: one page of the
   * portal fetched user/en.json twice on every first visit.
   */
  it('asks for a file once however often it is wanted', () => {
    let first: unknown;
    let second: unknown;
    loader.getTranslation('user/en').subscribe((t) => (first = t));
    loader.getTranslation('user/en').subscribe((t) => (second = t));

    const req = http.expectOne('/i18n/user/en.json');
    req.flush({ 'user.dashboard.title': 'Overview' });

    expect(first).toEqual({ 'user.dashboard.title': 'Overview' });
    expect(second).toEqual(first);
  });

  /*
   * Holding on to a failure would be worse than not holding on at all: the
   * library retries a translation file it did not get, and every retry would
   * be answered with the same remembered error, leaving the portal without
   * its words for as long as the page stays open. Sharing resets itself on an
   * error, which is what makes the cache above safe; this holds that down.
   */
  it('forgets a file that did not arrive', () => {
    let failed = false;
    loader.getTranslation('de').subscribe({ error: () => (failed = true) });
    http.expectOne('/i18n/de.json').flush('nothing here', { status: 503, statusText: 'Unavailable' });
    expect(failed).toBe(true);

    let seen: unknown;
    loader.getTranslation('de').subscribe((t) => (seen = t));
    http.expectOne('/i18n/de.json').flush({ 'actions.save': 'Speichern' });

    expect(seen).toEqual({ 'actions.save': 'Speichern' });
  });

  it('still asks again for a different file', () => {
    loader.getTranslation('user/en').subscribe();
    loader.getTranslation('user/de').subscribe();

    http.expectOne('/i18n/user/en.json').flush({});
    http.expectOne('/i18n/user/de.json').flush({});
  });
});
