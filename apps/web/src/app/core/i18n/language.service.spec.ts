import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../auth/auth.store';
import type { SessionUser } from '../models';
import { provideTestI18n } from '../../testing/i18n';
import { LanguageService } from './language.service';
import { provideI18n } from './transloco.config';

const CUSTOMER: SessionUser = {
  id: 7,
  email: 'someone@example.com',
  role: 'user',
  firstName: null,
  lastName: null,
  language: 'en',
  echocallCustomerId: 141478,
};

describe('LanguageService', () => {
  let http: HttpTestingController;
  let auth: AuthStore;
  let language: LanguageService;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);
    language = TestBed.inject(LanguageService);
    transloco = TestBed.inject(TranslocoService);
  });

  afterEach(() => http.verify());

  it('remembers the choice of a user whose account is their own', async () => {
    auth.user.set(CUSTOMER);
    const done = language.change('de');

    const req = http.expectOne('/api/account/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ language: 'de' });
    req.flush({ ...CUSTOMER, language: 'de' });
    await done;

    expect(auth.user()?.language).toBe('de');
    expect(transloco.getActiveLang()).toBe('de');
  });

  it('switches the interface without touching an account an operator is only visiting', async () => {
    auth.user.set({ ...CUSTOMER, impersonator: { id: 1, email: 'admin@example.com' } });

    await language.change('fr');

    expect(transloco.getActiveLang()).toBe('fr');
    expect(language.current()).toBe('fr');
    // No request: the customer's saved language is not the operator's to change.
  });

  it('switches the interface for a visitor who has no account at all', async () => {
    await language.change('fr');

    expect(transloco.getActiveLang()).toBe('fr');
  });
});

/*
 * With the real loader behind it, so that the moment the file is asked for is
 * part of the test. The library fetches a language the first time something on
 * screen wants a word from it, which on a slow line was half a second after
 * the language itself was already known: the texts then arrived after the
 * pages that needed them, and the first frame of the portal was blank boxes.
 */
describe('LanguageService, on a real connection', () => {
  let http: HttpTestingController;
  let auth: AuthStore;
  let language: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18n()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);
    language = TestBed.inject(LanguageService);
  });

  afterEach(() => http.verify());

  it('asks for the interface texts as soon as it knows the language', () => {
    auth.user.set({ ...CUSTOMER, language: 'fr' });

    language.init();

    http.expectOne('/i18n/fr.json').flush({ 'actions.save': 'Enregistrer' });
    // English rides along: it is what fills in a line a translation is missing.
    http.expectOne('/i18n/en.json').flush({ 'actions.save': 'Save' });
  });

  /* English being both the language and its own fallback must not cost two requests. */
  it('starts the visitor sign-in page in the language the portal defaults to', () => {
    language.init();

    http.expectOne('/i18n/en.json').flush({ 'actions.save': 'Save' });
  });
});
