import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import type { SessionUser } from '../../core/models';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { TwoFactorPanel } from './two-factor.panel';

const USER: SessionUser = {
  id: 2,
  email: 'customer@example.com',
  role: 'user',
  firstName: 'Kai',
  lastName: 'Kunde',
  language: 'de',
  echocallCustomerId: 501,
};

const ENROLMENT = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  otpauthUrl: 'otpauth://totp/Nordwind:customer@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  qrSvg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>',
};

describe('TwoFactorPanel', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TwoFactorPanel, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(user: SessionUser = USER) {
    TestBed.inject(AuthStore).setUser(user);
    const fixture = TestBed.createComponent(TwoFactorPanel);
    await fixture.whenStable();
    return fixture;
  }

  /** Runs the enrolment up to the point where the code is asked for. */
  async function startEnrolment() {
    const fixture = await render();
    byTestId(fixture, 'two-factor-start').click();
    http.expectOne('/api/auth/2fa/setup').flush(ENROLMENT);
    await fixture.whenStable();
    return fixture;
  }

  it('says the account has no second factor before anything is set up', async () => {
    const fixture = await render();

    expect(byTestId(fixture, 'two-factor-status').textContent?.trim()).toBe(
      TEXTS.account.twoFactor.statusOff,
    );
  });

  it('shows the drawing and the typed key an app cannot scan', async () => {
    const fixture = await startEnrolment();

    expect(byTestId(fixture, 'two-factor-qr').querySelector('svg')).toBeTruthy();
    expect(byTestId(fixture, 'two-factor-secret').textContent?.trim()).toBe(ENROLMENT.secret);
  });

  it('does not send a code that is too short to be one', async () => {
    const fixture = await startEnrolment();
    type(fixture, 'activation-code', '123');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/2fa/activate');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.minLength.split('{{')[0].trim());
  });

  it('keeps the enrolment open and names the reason when the code is wrong', async () => {
    const fixture = await startEnrolment();
    type(fixture, 'activation-code', '000000');
    submit(fixture);
    http
      .expectOne('/api/auth/2fa/activate')
      .flush(
        { error: { code: 'invalid_code', message: 'That code does not match' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'activation-code')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('That code does not match');
    expect(TestBed.inject(AuthStore).user()?.twoFactorEnabled).not.toBe(true);
  });

  it('shows the recovery codes once the second factor is active', async () => {
    const fixture = await startEnrolment();
    type(fixture, 'activation-code', '123456');
    submit(fixture);

    const request = http.expectOne('/api/auth/2fa/activate');
    expect(request.request.body).toEqual({ code: '123456' });
    request.flush({ recoveryCodes: ['abcd-1234', 'efgh-5678'] });
    await fixture.whenStable();

    const codes = byTestId(fixture, 'recovery-codes').textContent ?? '';
    expect(codes).toContain('abcd-1234');
    expect(codes).toContain('efgh-5678');
    expect(TestBed.inject(AuthStore).user()?.twoFactorEnabled).toBe(true);

    // They are shown exactly once; acknowledging them leaves the status view.
    byTestId(fixture, 'recovery-done').click();
    await fixture.whenStable();
    expect(byTestId(fixture, 'two-factor-status').textContent?.trim()).toBe(TEXTS.account.twoFactor.statusOn);
  });

  it('asks for the password before it removes the second factor', async () => {
    const fixture = await render({ ...USER, twoFactorEnabled: true });
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/2fa');

    type(fixture, 'disable-password', 'correct horse battery');
    submit(fixture);
    const request = http.expectOne('/api/auth/2fa');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ password: 'correct horse battery' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.twoFactorEnabled).toBe(false);
    expect(byTestId(fixture, 'two-factor-status').textContent?.trim()).toBe(
      TEXTS.account.twoFactor.statusOff,
    );
  });

  it('names a wrong password on the field instead of removing anything', async () => {
    const fixture = await render({ ...USER, twoFactorEnabled: true });
    type(fixture, 'disable-password', 'wrong');
    submit(fixture);
    http
      .expectOne('/api/auth/2fa')
      .flush(
        { error: { code: 'invalid_password', message: 'The password is incorrect' } },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('The password is incorrect');
    expect(TestBed.inject(AuthStore).user()?.twoFactorEnabled).toBe(true);
  });
});
