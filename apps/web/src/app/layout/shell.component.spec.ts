import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../core/auth/auth.store';
import { BrandingService, DEFAULT_BRANDING } from '../core/branding/branding.service';
import type { SessionUser } from '../core/models';
import { provideTestI18n, TEXTS } from '../testing/i18n';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class BlankPage {}

const ADMIN: SessionUser = {
  id: 1,
  email: 'admin@example.com',
  role: 'admin',
  firstName: 'Ada',
  lastName: 'Lovelace',
  language: 'de',
  echocallCustomerId: null,
};

const NOTIFICATION = {
  id: 4,
  type: 'call.missed',
  title: 'Anruf verpasst',
  message: 'Ein Anrufer hat aufgelegt.',
  isRead: false,
  createdAt: '2026-09-16T10:00:00.000Z',
};

const CUSTOMER: SessionUser = {
  ...ADMIN,
  id: 2,
  email: 'customer@example.com',
  role: 'user',
  echocallCustomerId: 42,
};

/** The same customer, seen by the operator who opened the session as them. */
const IMPERSONATED: SessionUser = { ...CUSTOMER, impersonator: { id: 1, email: 'admin@example.com' } };

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: BlankPage },
          { path: 'admin', component: BlankPage },
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function render(user: SessionUser, unread = 0) {
    TestBed.inject(AuthStore).setUser(user);
    TestBed.inject(BrandingService).update({ ...DEFAULT_BRANDING, productName: 'Acme Portal' });
    const fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
    if (user.role !== 'admin') {
      TestBed.inject(HttpTestingController)
        .expectOne((req) => req.url === '/api/hub/notifications')
        .flush({ data: [NOTIFICATION], pagination: { page: 1, perPage: 5, total: unread } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }
    return fixture;
  }

  function navLinks(fixture: { nativeElement: HTMLElement }): string[] {
    return [...fixture.nativeElement.querySelectorAll<HTMLAnchorElement>('mat-nav-list a')].map(
      (a) => a.getAttribute('href') ?? '',
    );
  }

  it('offers administrators the admin navigation', async () => {
    const fixture = await render(ADMIN);
    expect(navLinks(fixture)).toEqual([
      '/admin',
      '/admin/customers',
      '/admin/users',
      '/admin/settings',
      '/admin/audit',
    ]);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.nav.users);
  });

  it('offers customers the full workspace navigation', async () => {
    const fixture = await render(CUSTOMER);
    expect(navLinks(fixture)).toEqual([
      '/app',
      '/app/agents',
      '/app/chatbots',
      '/app/numbers',
      '/app/inbox',
      '/app/conversations',
      '/app/analytics',
      '/app/integrations',
      '/app/webhooks',
      '/app/campaigns',
      '/app/tickets',
      '/account',
    ]);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.nav.agents);
  });

  it('shows the operator brand and never the service brand', async () => {
    const fixture = await render(CUSTOMER);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Acme Portal');
    expect(text.toLowerCase()).not.toContain('echocall');
  });

  it('counts the unread notifications on the bell', async () => {
    const fixture = await render(CUSTOMER, 3);

    expect(fixture.nativeElement.querySelector('[data-testid="notifications-bell"]')).not.toBeNull();
    expect(fixture.componentInstance.unread()).toBe(3);
  });

  it('keeps the bell away from the administration', async () => {
    const fixture = await render(ADMIN);

    expect(fixture.componentInstance.showBell()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="notifications-bell"]')).toBeNull();
  });

  it('says whose portal an operator is looking at and offers the way back', async () => {
    const fixture = await render(IMPERSONATED);

    const banner = fixture.nativeElement.querySelector('[data-testid="impersonation-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('customer@example.com');

    fixture.nativeElement.querySelector('[data-testid="impersonation-stop"]').click();
    await settle();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/impersonation/stop').flush(ADMIN);
    await settle();

    expect(TestBed.inject(AuthStore).user()?.role).toBe('admin');
    expect(TestBed.inject(Router).url).toBe('/admin');
  });

  it('keeps the banner away from a customer signing in themselves', async () => {
    const fixture = await render(CUSTOMER);

    expect(fixture.nativeElement.querySelector('[data-testid="impersonation-banner"]')).toBeNull();
  });

  it('signs out through the API and returns to the login page', async () => {
    const fixture = await render(ADMIN);
    const pending = fixture.componentInstance.logout();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await pending;
    expect(TestBed.inject(AuthStore).user()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
