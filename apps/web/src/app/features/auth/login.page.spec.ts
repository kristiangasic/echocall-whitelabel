import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { LoginPage } from './login.page';

@Component({ template: '' })
class BlankPage {}

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin', component: BlankPage },
          { path: 'app', component: BlankPage },
          { path: 'login', component: LoginPage },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    return fixture;
  }

  it('signs an administrator in and opens the admin area', async () => {
    const fixture = await render();
    type(fixture, 'email', 'admin@example.com');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);

    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'admin@example.com', password: 'correct horse battery' });
    request.flush({
      id: 1,
      email: 'admin@example.com',
      role: 'admin',
      firstName: 'Ada',
      lastName: null,
      language: 'en',
      echocallCustomerId: null,
    });
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.email).toBe('admin@example.com');
    expect(router.url).toBe('/admin');
  });

  it('shows the reason the server gives when the sign-in fails', async () => {
    const fixture = await render();
    type(fixture, 'email', 'admin@example.com');
    type(fixture, 'password', 'wrong');
    submit(fixture);

    http
      .expectOne('/api/auth/login')
      .flush(
        { error: { code: 'invalid_credentials', message: 'Invalid credentials' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'login-error').textContent?.trim()).toBe(TEXTS.errors.invalid_credentials);
    expect(TestBed.inject(AuthStore).user()).toBeNull();
    expect(router.url).not.toBe('/admin');
  });

  it('does not call the server while the form is incomplete', async () => {
    const fixture = await render();
    type(fixture, 'email', 'not-an-address');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/login');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.email);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.required);
  });

  const SESSION = {
    id: 7,
    email: 'lena@example.com',
    role: 'user',
    firstName: 'Lena',
    lastName: null,
    language: 'en',
    echocallCustomerId: 141467,
  };

  /** Signs in with a password and answers with the challenge the server sends. */
  async function reachSecondStep() {
    const fixture = await render();
    type(fixture, 'email', 'lena@example.com');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);
    http
      .expectOne('/api/auth/login')
      .flush(
        { challenge: 'c-1', expiresAt: '2026-09-17T10:05:00.000Z' },
        { status: 202, statusText: 'Accepted' },
      );
    await fixture.whenStable();
    return fixture;
  }

  it('asks for the code instead of signing in when the account has a second factor', async () => {
    const fixture = await reachSecondStep();

    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.twoFactor.title);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.twoFactor.recoveryHint);
    expect(byTestId(fixture, 'code')).toBeTruthy();
    expect(TestBed.inject(AuthStore).user()).toBeNull();
    expect(router.url).not.toBe('/app');
  });

  it('offers the code field the phone keyboard and the one-time-code fill', async () => {
    const fixture = await reachSecondStep();
    const input = byTestId<HTMLInputElement>(fixture, 'code');

    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
  });

  it('starts the session once the code is accepted', async () => {
    const fixture = await reachSecondStep();
    type(fixture, 'code', '123456');
    submit(fixture);

    const request = http.expectOne('/api/auth/2fa/verify');
    expect(request.request.body).toEqual({ challenge: 'c-1', code: '123456' });
    request.flush(SESSION);
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.email).toBe('lena@example.com');
    expect(router.url).toBe('/app');
  });

  it('keeps the code step open and names the reason when the code is wrong', async () => {
    const fixture = await reachSecondStep();
    type(fixture, 'code', '000000');
    submit(fixture);
    http
      .expectOne('/api/auth/2fa/verify')
      .flush(
        { error: { code: 'invalid_code', message: 'Invalid code' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'login-error').textContent?.trim()).toBe(TEXTS.errors.invalid_code);
    expect(byTestId(fixture, 'code')).toBeTruthy();
    expect(TestBed.inject(AuthStore).user()).toBeNull();
  });

  // A challenge that has expired or burned its attempts can never work again,
  // so the field that would take a code disappears with it.
  it('returns to the password step when the challenge is gone', async () => {
    const fixture = await reachSecondStep();
    type(fixture, 'code', '123456');
    submit(fixture);
    http
      .expectOne('/api/auth/2fa/verify')
      .flush(
        { error: { code: 'invalid_challenge', message: 'Invalid challenge' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'password')).toBeTruthy();
    expect(byTestId(fixture, 'login-error').textContent?.trim()).toBe(TEXTS.errors.invalid_challenge);
  });

  it('does not call the server with a code that is too short to be one', async () => {
    const fixture = await reachSecondStep();
    type(fixture, 'code', '123');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/2fa/verify');
  });
});
