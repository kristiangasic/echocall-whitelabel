import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthStore } from './auth.store';

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function run(url: string) {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  it('sends anonymous visitors to the login page and remembers where they wanted to go', async () => {
    const http = TestBed.inject(HttpTestingController);
    const pending = run('/admin/users');
    http
      .expectOne('/api/auth/me')
      .flush(
        { error: { code: 'unauthenticated', message: 'Sign in' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    const result = await pending;
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary']?.segments.map((s) => s.path)).toEqual(['login']);
    expect(tree.queryParams['returnUrl']).toBe('/admin/users');
  });

  it('lets a signed-in user through without asking the server again', async () => {
    const auth = TestBed.inject(AuthStore);
    auth.setUser({
      id: 1,
      email: 'admin@example.com',
      role: 'admin',
      firstName: null,
      lastName: null,
      language: 'en',
      echocallCustomerId: null,
    });
    auth.loaded.set(true);
    expect(await run('/admin')).toBe(true);
    TestBed.inject(HttpTestingController).expectNone('/api/auth/me');
  });
});
