import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ADMIN_TEXTS, TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminCustomersPage } from './customers.page';

const CUSTOMERS = [
  {
    id: 1,
    resellerId: 9,
    userId: 501,
    createdAt: '2026-08-01T09:00:00.000Z',
    user: {
      id: 501,
      email: 'linked@example.com',
      firstName: 'Lina',
      lastName: 'Mayer',
      company: 'Mayer GmbH',
      balanceEur: '42.50',
      accountStatus: 'active',
    },
  },
  {
    id: 2,
    resellerId: 9,
    userId: 502,
    createdAt: '2026-08-02T09:00:00.000Z',
    user: {
      id: 502,
      email: 'lonely@example.com',
      firstName: null,
      lastName: null,
      company: null,
      balanceEur: '0.00',
      accountStatus: 'suspended',
    },
  },
];

const LOGINS = [
  {
    id: 3,
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    firstName: null,
    lastName: null,
    language: 'en',
    echocallCustomerId: null,
    lastLoginAt: null,
    createdAt: '2026-07-01T09:00:00.000Z',
  },
  {
    id: 4,
    email: 'linked@example.com',
    role: 'user',
    status: 'invited',
    firstName: 'Lina',
    lastName: 'Mayer',
    language: 'en',
    echocallCustomerId: 501,
    lastLoginAt: null,
    createdAt: '2026-08-01T09:05:00.000Z',
  },
];

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminCustomersPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;
  let snacks: string[];

  beforeEach(async () => {
    dialogResult = undefined;
    snacks = [];
    await TestBed.configureTestingModule({
      imports: [AdminCustomersPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: MatSnackBar, useValue: { open: (message: string) => snacks.push(message) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the two calls one page load makes and returns what the hub was asked for. */
  async function answerLoad(total = CUSTOMERS.length) {
    const customers = http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers');
    customers.flush({
      data: CUSTOMERS,
      pagination: { page: Number(customers.request.params.get('page')), perPage: 25, total },
    });
    http.expectOne('/api/admin/users').flush({ data: LOGINS });
    await settle();
    return customers.request;
  }

  async function render(total = CUSTOMERS.length) {
    const fixture = TestBed.createComponent(AdminCustomersPage);
    await fixture.whenStable();
    await answerLoad(total);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('shows every customer with its portal login and marks the ones without', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('linked@example.com');
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[0].textContent).toContain('Mayer GmbH');
    expect(rows[0].textContent).toContain('42.50');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.customers.accountStatuses.active);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.customers.accountStatuses.suspended);
    expect(rows[1].querySelector('[data-testid="no-login"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="no-login"]')).toBeNull();
  });

  it('asks the first page with the page size the paginator shows', async () => {
    const fixture = TestBed.createComponent(AdminCustomersPage);
    await fixture.whenStable();
    const request = await answerLoad();

    expect(request.params.get('page')).toBe('1');
    expect(request.params.get('perPage')).toBe('25');
  });

  it('asks the hub for the next page when the paginator moves', async () => {
    const fixture = await render(60);

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = await answerLoad(60);

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('perPage')).toBe('50');
  });

  it('suspends only after the confirmation was accepted', async () => {
    const fixture = await render();

    fixture.componentInstance.setSuspended(fixture.componentInstance.rows()[0], true);
    await settle();
    http.expectNone('/api/admin/customers/501/suspend');

    dialogResult = true;
    fixture.componentInstance.setSuspended(fixture.componentInstance.rows()[0], true);
    await settle();
    const suspend = http.expectOne('/api/admin/customers/501/suspend');
    expect(suspend.request.method).toBe('POST');
    suspend.flush({ user: null });
    await settle();
    await answerLoad();
  });

  it('says why a customer on a running subscription was not deleted', async () => {
    const fixture = await render();

    dialogResult = true;
    fixture.componentInstance.remove(fixture.componentInstance.rows()[0]);
    await settle();
    // The hub refuses while the customer is still being billed, and the operator
    // has to read what to do about it, not "something went wrong".
    http
      .expectOne('/api/admin/customers/501')
      .flush(
        { error: { code: 'subscription_active', message: 'Cancel the running subscriptions first' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(snacks).toEqual([TEXTS.errors.subscription_active]);
  });

  it('invites a portal login for a customer that has none', async () => {
    const fixture = await render();

    void fixture.componentInstance.inviteLogin(fixture.componentInstance.rows()[1]);
    await settle();
    const invite = http.expectOne('/api/admin/users/invite');
    expect(invite.request.body).toMatchObject({
      email: 'lonely@example.com',
      role: 'user',
      echocallCustomerId: 502,
    });
    invite.flush({ user: LOGINS[1], inviteLink: 'http://localhost/accept-invite?token=x', mailSent: true });
    await settle();
    await answerLoad();
  });
});
