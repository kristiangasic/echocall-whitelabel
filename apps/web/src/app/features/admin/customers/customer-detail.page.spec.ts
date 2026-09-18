import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminCustomerDetailPage } from './customer-detail.page';

@Component({ template: '' })
class BlankPage {}

/** The session the portal hands back once it was opened as this customer. */
const CUSTOMER_SESSION = {
  id: 7,
  email: 'linked@example.com',
  role: 'user',
  firstName: 'Lina',
  lastName: 'Mayer',
  language: 'en',
  echocallCustomerId: 501,
  impersonator: { id: 1, email: 'admin@example.com' },
};

const CUSTOMER = {
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
};

const USAGE = {
  customerId: 501,
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-17T10:00:00.000Z' },
  usage: [{ usageType: 'voice_minute', totalQuantity: 128.5, totalRevenue: 25.7 }],
};

const SUBSCRIPTION = {
  subscription: {
    id: 31,
    customerId: 501,
    planId: 4,
    status: 'active',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-07-01T00:00:00.000Z',
  },
  plan: { id: 4, name: 'Business', priceEur: '49.00' },
};

const TRANSACTION = {
  id: 77,
  customerId: 501,
  amount: '25.00',
  balanceAfter: '42.50',
  type: 'admin_adjustment',
  description: 'Gutschrift',
  createdAt: '2026-09-10T09:00:00.000Z',
};

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Parts {
  balance?: number;
  usage?: unknown;
  subscriptions?: unknown[];
  transactions?: unknown[];
  transactionTotal?: number;
}

describe('AdminCustomerDetailPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminCustomerDetailPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app', component: BlankPage }]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '501' }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the customer itself, then the three calls that follow it, then
   *  the paged transactions. The three only leave once the customer is here. */
  async function answerLoad(parts: Parts = {}) {
    http.expectOne('/api/admin/hub/resellers/customers/501').flush(CUSTOMER);
    await settle();
    return answerParts(parts);
  }

  async function answerParts(parts: Parts = {}) {
    http
      .expectOne('/api/admin/hub/resellers/customers/501/balance')
      .flush({ balance: parts.balance ?? 42.5, email: CUSTOMER.user.email });
    http.expectOne('/api/admin/hub/resellers/customers/501/usage').flush(parts.usage ?? USAGE);
    http
      .expectOne('/api/admin/hub/resellers/customers/501/subscriptions')
      .flush({ data: parts.subscriptions ?? [SUBSCRIPTION] });
    await settle();
    return answerTransactions(parts);
  }

  async function answerTransactions(parts: Parts = {}) {
    const rows = parts.transactions ?? [TRANSACTION];
    const request = http.expectOne(
      (req) => req.url === '/api/admin/hub/resellers/customers/501/transactions',
    );
    request.flush({
      data: rows,
      pagination: {
        page: Number(request.request.params.get('page')),
        perPage: Number(request.request.params.get('perPage')),
        total: parts.transactionTotal ?? rows.length,
      },
    });
    await settle();
    return request.request;
  }

  async function render(parts: Parts = {}) {
    const fixture = TestBed.createComponent(AdminCustomerDetailPage);
    await fixture.whenStable();
    await answerLoad(parts);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the customer with its wallet, usage, subscription and movements', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('linked@example.com');
    expect(text).toContain('Lina Mayer');
    expect(fixture.nativeElement.querySelector('[data-testid="balance"]').textContent).toContain('42.50');
    expect(text).toContain(ADMIN_TEXTS.customer.usage.types.voice_minute);
    expect(text).toContain('Business');
    expect(text).toContain('Gutschrift');
  });

  it('renders the empty state rather than zeros when nothing was used', async () => {
    const fixture = await render({ usage: { ...USAGE, usage: [] } });

    expect(fixture.nativeElement.querySelector('[data-testid="usage-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.customer.usage.empty);
  });

  it('tops the wallet up with the amount and the reason, and shows the new balance', async () => {
    dialogResult = { amount: 25, description: 'Gutschrift' };
    const fixture = await render();

    fixture.componentInstance.move('add');
    await settle();
    const booking = http.expectOne('/api/admin/hub/resellers/customers/501/balance/add');
    expect(booking.request.method).toBe('POST');
    expect(booking.request.body).toEqual({ amount: 25, description: 'Gutschrift' });
    booking.flush({ success: true, newBalance: 67.5 });
    await settle();
    await answerTransactions();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="balance"]').textContent).toContain('67.50');
  });

  it('says what is left when the deduction is larger than the wallet', async () => {
    dialogResult = { amount: 100, description: 'Storno' };
    const fixture = await render();

    fixture.componentInstance.move('subtract');
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/customers/501/balance/subtract')
      .flush(
        { error: { code: 'insufficient_balance', message: 'Insufficient balance. Available: 42.50' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();
    // The refusal is answered with a fresh balance, not with the stale view.
    http.expectOne('/api/admin/hub/resellers/customers/501/balance').flush({ balance: 42.5 });
    await settle();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[data-testid="balance-error"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('42.50');
  });

  it('asks the service for the next page of movements', async () => {
    const fixture = await render({ transactionTotal: 60 });

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = await answerTransactions({ transactionTotal: 60 });

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('perPage')).toBe('50');
  });

  it('opens the portal as the customer and lands in their workspace', async () => {
    const fixture = await render();

    fixture.nativeElement.querySelector('[data-testid="open-as"]').click();
    await settle();
    const started = http.expectOne('/api/admin/customers/501/impersonate');
    expect(started.request.method).toBe('POST');
    started.flush(CUSTOMER_SESSION);
    await settle();

    expect(TestBed.inject(AuthStore).user()?.impersonator?.email).toBe('admin@example.com');
    expect(TestBed.inject(Router).url).toBe('/app');
  });

  it('says so when the customer is not one of ours', async () => {
    const fixture = TestBed.createComponent(AdminCustomerDetailPage);
    await fixture.whenStable();
    answerMissing();
    await settle();
    answerList([]);
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="missing"]')).not.toBeNull();
  });

  it('takes the customer from the list when the service answers no single one', async () => {
    const fixture = TestBed.createComponent(AdminCustomerDetailPage);
    await fixture.whenStable();
    answerMissing();
    await settle();
    const list = answerList([CUSTOMER]);
    await settle();
    await answerParts();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(list.params.get('perPage')).toBe('100');
    expect(fixture.nativeElement.querySelector('[data-testid="missing"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('linked@example.com');
  });

  /** The service does not know this route, which reads exactly like a 404. */
  function answerMissing() {
    http
      .expectOne('/api/admin/hub/resellers/customers/501')
      .flush(
        { error: { code: 'not_found', message: 'Customer not found' } },
        { status: 404, statusText: 'Not Found' },
      );
  }

  function answerList(rows: unknown[]) {
    const request = http.expectOne(
      (req) => req.url === '/api/admin/hub/resellers/customers',
    );
    request.flush({
      data: rows,
      pagination: { page: 1, perPage: 100, total: rows.length },
    });
    return request.request;
  }
});
