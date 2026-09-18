import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrandingService } from '../../core/branding/branding.service';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { RegisterPage } from './register.page';

@Component({ template: '' })
class BlankPage {}

describe('RegisterPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', component: BlankPage }]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(selfServiceEnabled = true) {
    TestBed.inject(BrandingService).setRegistration({ selfServiceEnabled, signInLinksEnabled: false });
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    return fixture;
  }

  it('sends the sign-up and says to look in the inbox', async () => {
    const fixture = await render();
    type(fixture, 'email', ' mara@example.com ');
    submit(fixture);

    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({
      email: 'mara@example.com',
      firstName: undefined,
      lastName: undefined,
      company: undefined,
      language: 'en',
    });
    request.flush({ accepted: true }, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();

    expect(byTestId(fixture, 'done').textContent?.trim()).toBe(TEXTS.auth.register.done);
  });

  it('does not call the server without a usable address', async () => {
    const fixture = await render();
    type(fixture, 'email', 'not-an-address');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/register');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.email);
  });

  // The route stays reachable while the operator has sign-ups off, because a
  // link to it may be in circulation. It then says so instead of taking data.
  it('takes nothing while the portal is closed for sign-ups', async () => {
    const fixture = await render(false);

    expect(byTestId(fixture, 'closed').textContent?.trim()).toBe(TEXTS.auth.register.closed);
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });
});
