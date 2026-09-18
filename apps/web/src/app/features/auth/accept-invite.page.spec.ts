import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { AcceptInvitePage } from './accept-invite.page';

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

describe('AcceptInvitePage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcceptInvitePage, provideTestI18n()],
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

  async function render(token: string | null = 't-1') {
    const fixture = TestBed.createComponent(AcceptInvitePage);
    if (token !== null) fixture.componentRef.setInput('token', token);
    await fixture.whenStable();
    return fixture;
  }

  it('activates the account against the name alone', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.invite.intro);

    type(fixture, 'first-name', 'Lena');
    submit(fixture);

    const request = http.expectOne('/api/auth/accept-invite');
    expect(request.request.body).toEqual({ token: 't-1', firstName: 'Lena', lastName: '' });
    request.flush(SESSION);
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.email).toBe('lena@example.com');
    expect(router.url).toBe('/app');
  });

  it('asks for nothing at all beyond the name', async () => {
    const fixture = await render();
    const html = fixture.nativeElement as HTMLElement;

    expect(html.querySelector('input[type="password"]')).toBeNull();
    submit(fixture);

    http.expectOne('/api/auth/accept-invite').flush(SESSION);
    await fixture.whenStable();

    expect(router.url).toBe('/app');
  });

  it('says so when the invitation is spent, instead of sending the name anywhere', async () => {
    const fixture = await render();
    submit(fixture);
    http
      .expectOne('/api/auth/accept-invite')
      .flush(
        { error: { code: 'invalid_token', message: 'Invalid token' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.invite.invalid);
  });

  it('shows the same refusal for a link that carried no token', async () => {
    const fixture = await render(null);

    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.invite.invalid);
  });
});
