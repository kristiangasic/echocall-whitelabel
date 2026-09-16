import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { byTestId, submit, type } from '../../testing/dom';
import { provideTestI18n, TEXTS } from '../../testing/i18n';
import { LoginPage } from './login.page';

@Component({ template: '' })
class BlankPage {}

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin', component: BlankPage },
          { path: 'app', component: BlankPage },
          { path: 'login', component: LoginPage },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    return fixture;
  }

  it('signs an administrator in and opens the admin area', async () => {
    const fixture = await render();
    type(fixture, 'email', 'admin@example.com');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);

    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'admin@example.com', password: 'correct horse battery' });
    request.flush({
      id: 1,
      email: 'admin@example.com',
      role: 'admin',
      firstName: 'Ada',
      lastName: null,
      language: 'de',
      echocallCustomerId: null,
    });
    await fixture.whenStable();

    expect(TestBed.inject(AuthStore).user()?.email).toBe('admin@example.com');
    expect(router.url).toBe('/admin');
  });

  it('shows the reason the server gives when the sign-in fails', async () => {
    const fixture = await render();
    type(fixture, 'email', 'admin@example.com');
    type(fixture, 'password', 'wrong');
    submit(fixture);

    http
      .expectOne('/api/auth/login')
      .flush(
        { error: { code: 'invalid_credentials', message: 'Invalid credentials' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(byTestId(fixture, 'login-error').textContent?.trim()).toBe(TEXTS.errors.invalid_credentials);
    expect(TestBed.inject(AuthStore).user()).toBeNull();
    expect(router.url).not.toBe('/admin');
  });

  it('does not call the server while the form is incomplete', async () => {
    const fixture = await render();
    type(fixture, 'email', 'not-an-address');
    submit(fixture);
    await fixture.whenStable();

    http.expectNone('/api/auth/login');
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.email);
    expect(fixture.nativeElement.textContent).toContain(TEXTS.validation.required);
  });
});
