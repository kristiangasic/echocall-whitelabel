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

  it('prefills the profile form from the session', async () => {
    const fixture = await render(CUSTOMER);

    expect(fixture.componentInstance.profile.getRawValue()).toEqual({
      firstName: 'Kai',
      lastName: 'Kunde',
      language: 'de',
    });
  });
});
