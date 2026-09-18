import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { BrandingService } from '../../core/branding/branding.service';
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

  async function render(signInLinksEnabled = false) {
    TestBed.inject(BrandingService).setRegistration({ selfServiceEnabled: false, signInLinksEnabled });
    const fixture = TestBed.createComponent(AcceptInvitePage);
    fixture.componentRef.setInput('token', 't-1');
    await fixture.whenStable();
    return fixture;
  }

  it('sets the password the invitation asks for and opens the portal', async () => {
    const fixture = await render();
    type(fixture, 'password', 'welcome aboard 1');
    type(fixture, 'confirm', 'welcome aboard 1');
    submit(fixture);

    const request = http.expectOne('/api/auth/accept-invite');
    expect(request.request.body).toMatchObject({ token: 't-1', password: 'welcome aboard 1' });
    request.flush(SESSION);
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.email).toBe('lena@example.com');
    expect(router.url).toBe('/app');
  });

  it('insists on a password while the portal has no other way in', async () => {
    const fixture = await render();
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/accept-invite');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.required);
  });

  // With sign-in links on, the account has a way in without a password, and
  // the form must not stand in the way of using it.
  it('activates the account without a password where links are offered', async () => {
    const fixture = await render(true);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.invite.introNoPassword);
    submit(fixture);

    const request = http.expectOne('/api/auth/accept-invite');
    expect(request.request.body).not.toHaveProperty('password');
    request.flush(SESSION);
    await fixture.whenStable();

    expect(router.url).toBe('/app');
  });

  it('still asks for the repeat once a password was typed', async () => {
    const fixture = await render(true);
    type(fixture, 'password', 'welcome aboard 1');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/accept-invite');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.required);
  });
});
