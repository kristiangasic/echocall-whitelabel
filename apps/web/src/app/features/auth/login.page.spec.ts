import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrandingService } from '../../core/branding/branding.service';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * The page reads the sign-up switch as it is created, so it is set first.
   * Off is what a portal looks like until an operator opens it up.
   */
  async function render(selfServiceEnabled = false) {
    TestBed.inject(BrandingService).setRegistration({ selfServiceEnabled });
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    return fixture;
  }

  it('asks for an address and mails a link to it', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.link.title);

    type(fixture, 'link-email', 'lena@example.com');
    submit(fixture);

    const request = http.expectOne('/api/auth/sign-in-link');
    expect(request.request.body).toEqual({ email: 'lena@example.com' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    // The answer says a link is on its way, never whether the address is known.
    expect(byTestId(fixture, 'link-sent').textContent?.trim()).toBe(TEXTS.auth.link.done);
  });

  it('offers another link to whoever mistyped their address', async () => {
    const fixture = await render();
    type(fixture, 'link-email', 'lena@exmaple.com');
    submit(fixture);
    http.expectOne('/api/auth/sign-in-link').flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    byTestId(fixture, 'send-again').click();
    await fixture.whenStable();

    expect(byTestId(fixture, 'link-email')).toBeTruthy();
  });

  it('does not call the server with something that is not an address', async () => {
    const fixture = await render();
    type(fixture, 'link-email', 'not-an-address');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/sign-in-link');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.email);
  });

  it('names the reason when the portal refuses to send one', async () => {
    const fixture = await render();
    type(fixture, 'link-email', 'lena@example.com');
    submit(fixture);

    http
      .expectOne('/api/auth/sign-in-link')
      .flush(
        { error: { code: 'too_many_requests', message: 'Too many requests' } },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'login-error').textContent?.trim()).toBe(TEXTS.errors.too_many_requests);
  });

  it('keeps the sign-up form out of sight while the portal takes no sign-ups', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="to-register"]')).toBeNull();
  });

  it('points at the sign-up form where the operator takes sign-ups', async () => {
    const fixture = await render(true);

    expect(byTestId(fixture, 'to-register').getAttribute('href')).toBe('/register');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.auth.login.noAccount);
  });
});
