import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import type { AdminUser, SessionUser } from '../../../core/models';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminUsersPage } from './admin-users.page';

const OPERATOR: SessionUser = {
  id: 1,
  email: 'admin@example.com',
  role: 'admin',
  firstName: 'Ada',
  lastName: null,
  language: 'de',
  echocallCustomerId: null,
  twoFactorEnabled: true,
};

const USERS: AdminUser[] = [
  {
    id: 1,
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    firstName: 'Ada',
    lastName: null,
    language: 'de',
    echocallCustomerId: null,
    twoFactorEnabled: true,
    lastLoginAt: '2026-09-16T09:00:00.000Z',
    createdAt: '2026-07-01T09:00:00.000Z',
  },
  {
    id: 2,
    email: 'lena@example.com',
    role: 'user',
    status: 'active',
    firstName: 'Lena',
    lastName: 'Brandt',
    language: 'de',
    echocallCustomerId: 501,
    twoFactorEnabled: true,
    lastLoginAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 3,
    email: 'kai@example.com',
    role: 'user',
    status: 'active',
    firstName: null,
    lastName: null,
    language: 'de',
    echocallCustomerId: 502,
    twoFactorEnabled: false,
    lastLoginAt: null,
    createdAt: '2026-08-02T09:00:00.000Z',
  },
];

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminUsersPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;
  let snacks: string[];

  beforeEach(async () => {
    dialogResult = undefined;
    snacks = [];
    await TestBed.configureTestingModule({
      imports: [AdminUsersPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: MatSnackBar, useValue: { open: (message: string) => snacks.push(message) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).setUser(OPERATOR);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(AdminUsersPage);
    await fixture.whenStable();
    http.expectOne('/api/admin/users').flush({ data: USERS });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('marks the logins that ask for a second factor', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows[1].textContent).toContain(ADMIN_TEXTS.users.twoFactor);
    expect(rows[2].textContent).not.toContain(ADMIN_TEXTS.users.twoFactor);
  });

  it('clears the second factor of a locked-out account once the operator confirms', async () => {
    dialogResult = true;
    const fixture = await render();
    fixture.componentInstance.clearTwoFactor(USERS[1]);
    await settle();

    const request = http.expectOne('/api/admin/users/2/two-factor');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(snacks).toContain(ADMIN_TEXTS.users.twoFactorCleared);
    // The list is read again, so the mark disappears with the factor.
    http.expectOne('/api/admin/users').flush({ data: USERS });
  });

  it('does not touch anything when the operator cancels', async () => {
    dialogResult = false;
    const fixture = await render();
    fixture.componentInstance.clearTwoFactor(USERS[1]);
    await settle();

    http.expectNone('/api/admin/users/2/two-factor');
    expect(snacks).toEqual([]);
  });
});
