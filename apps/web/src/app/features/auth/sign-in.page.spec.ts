import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { SignInPage } from './sign-in.page';

@Component({ template: '' })
class BlankPage {}

const SESSION = {
  id: 7,
  email: 'lena@example.com',
  role: 'user',
  firstName: 'Lena',
  lastName: null,
  language: 'en',
  echocallCustomerId: 141467,
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SignInPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignInPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'app', component: BlankPage },
          { path: 'login', component: BlankPage },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** The token is whatever the mailed link carried, including nothing at all. */
  async function render(token: string | undefined) {
    const fixture = TestBed.createComponent(SignInPage);
    fixture.componentRef.setInput('token', token);
    await fixture.whenStable();
    return fixture;
  }

  /** The page acts on its own as it opens, so the view follows a turn later. */
  async function redraw(fixture: Awaited<ReturnType<typeof render>>) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('spends the token as the page opens and lands in the portal', async () => {
    const fixture = await render('t-1');

    const request = http.expectOne('/api/auth/sign-in-link/consume');
    expect(request.request.body).toEqual({ token: 't-1' });
    request.flush(SESSION);
    await redraw(fixture);

    expect(TestBed.inject(AuthStore).user()?.email).toBe('lena@example.com');
    expect(router.url).toBe('/app');
  });

  it('says the link no longer works when the server refuses it', async () => {
    const fixture = await render('t-1');
    http
      .expectOne('/api/auth/sign-in-link/consume')
      .flush(
        { error: { code: 'invalid_token', message: 'Invalid token' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await redraw(fixture);

    expect(byTestId(fixture, 'link-invalid').textContent?.trim()).toBe(TEXTS.auth.signIn.invalid);
    expect(TestBed.inject(AuthStore).user()).toBeNull();
  });

  it('asks for nothing when the address carries no token at all', async () => {
    const fixture = await render(undefined);
    await redraw(fixture);

    http.expectNone('/api/auth/sign-in-link/consume');
    expect(byTestId(fixture, 'link-invalid')).toBeTruthy();
  });

  it('still asks for the second factor of an account that has one', async () => {
    const fixture = await render('t-1');
    http
      .expectOne('/api/auth/sign-in-link/consume')
      .flush(
        { challenge: 'c-1', expiresAt: '2026-09-17T10:05:00.000Z' },
        { status: 202, statusText: 'Accepted' },
      );
    await redraw(fixture);

    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.twoFactor.title);
    type(fixture, 'code', '123456');
    submit(fixture);

    const verify = http.expectOne('/api/auth/2fa/verify');
    expect(verify.request.body).toEqual({ challenge: 'c-1', code: '123456' });
    verify.flush(SESSION);
    await redraw(fixture);

    expect(router.url).toBe('/app');
  });

  it('empties the code field after a wrong one without calling it missing', async () => {
    const fixture = await render('t-1');
    http
      .expectOne('/api/auth/sign-in-link/consume')
      .flush(
        { challenge: 'c-1', expiresAt: '2026-09-17T10:05:00.000Z' },
        { status: 202, statusText: 'Accepted' },
      );
    await redraw(fixture);

    type(fixture, 'code', '000000');
    submit(fixture);
    http
      .expectOne('/api/auth/2fa/verify')
      .flush(
        { error: { code: 'invalid_code', message: 'Wrong code' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await redraw(fixture);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(TEXTS.errors.invalid_code);
    expect(text).not.toContain(TEXTS.validation.required);
    expect((byTestId(fixture, 'code') as HTMLInputElement).value).toBe('');
  });
});
