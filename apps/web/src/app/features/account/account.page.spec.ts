import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import type { SessionUser } from '../../core/models';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { AccountPage } from './account.page';

const CUSTOMER: SessionUser = {
  id: 2,
  email: 'customer@example.com',
  role: 'user',
  firstName: 'Kai',
  lastName: 'Kunde',
  language: 'de',
  echocallCustomerId: 501,
};

const OPERATOR: SessionUser = { ...CUSTOMER, id: 1, role: 'admin', echocallCustomerId: null };

describe('AccountPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(user: SessionUser) {
    TestBed.inject(AuthStore).setUser(user);
    const fixture = TestBed.createComponent(AccountPage);
    await fixture.whenStable();
    return fixture;
  }

  function tabLabels(fixture: { nativeElement: HTMLElement }): string[] {
    return [...fixture.nativeElement.querySelectorAll('.mat-mdc-tab .mdc-tab__text-label')].map((tab) =>
      (tab.textContent ?? '').trim(),
    );
  }

  it('offers a linked customer the billing tab', async () => {
    const fixture = await render(CUSTOMER);

    expect(tabLabels(fixture)).toEqual([TEXTS.account.tabs.profile, TEXTS.account.tabs.billing]);
  });

  it('keeps billing away from an account without a customer', async () => {
    const fixture = await render(OPERATOR);

    expect(fixture.componentInstance.showBilling()).toBe(false);
    expect(tabLabels(fixture)).toEqual([TEXTS.account.tabs.profile]);
  });

  it('leaves the password form clean after a successful change', async () => {
    const fixture = await render(CUSTOMER);
    const component = fixture.componentInstance;
    component.password.setValue({
      currentPassword: 'old-password-2026',
      newPassword: 'new-password-2026',
      confirm: 'new-password-2026',
    });

    // Submitting the form, not calling the method: a submitted form is what
    // makes Material show the errors this test is about.
    const form = fixture.nativeElement.querySelectorAll('form')[1] as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    http.expectOne('/api/account/password').flush(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(component.password.getRawValue()).toEqual({
      currentPassword: '',
      newPassword: '',
      confirm: '',
    });
    expect(fixture.nativeElement.querySelectorAll('mat-error')).toHaveLength(0);
  });

  it('prefills the profile form from the session', async () => {
    const fixture = await render(CUSTOMER);

    expect(fixture.componentInstance.profile.getRawValue()).toEqual({
      firstName: 'Kai',
      lastName: 'Kunde',
      language: 'de',
    });
  });
});
