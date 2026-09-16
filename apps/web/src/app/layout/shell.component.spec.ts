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

const CUSTOMER: SessionUser = {
  ...ADMIN,
  id: 2,
  email: 'customer@example.com',
  role: 'user',
  echocallCustomerId: 42,
};

describe('ShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', component: BlankPage }]),
      ],
    }).compileComponents();
  });

  async function render(user: SessionUser) {
    TestBed.inject(AuthStore).setUser(user);
    TestBed.inject(BrandingService).update({ ...DEFAULT_BRANDING, productName: 'Acme Portal' });
    const fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
    return fixture;
  }

  function navLinks(fixture: { nativeElement: HTMLElement }): string[] {
    return [...fixture.nativeElement.querySelectorAll<HTMLAnchorElement>('mat-nav-list a')].map(
      (a) => a.getAttribute('href') ?? '',
    );
  }

  it('offers administrators the admin navigation', async () => {
    const fixture = await render(ADMIN);
    expect(navLinks(fixture)).toEqual(['/admin', '/admin/users', '/admin/settings', '/admin/audit']);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.nav.users);
  });

  it('offers customers only their own pages', async () => {
    const fixture = await render(CUSTOMER);
    expect(navLinks(fixture)).toEqual(['/app', '/account']);
  });

  it('shows the operator brand and never the service brand', async () => {
    const fixture = await render(CUSTOMER);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Acme Portal');
    expect(text.toLowerCase()).not.toContain('echocall');
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
