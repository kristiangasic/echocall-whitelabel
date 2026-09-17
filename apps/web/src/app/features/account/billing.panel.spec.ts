import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DownloadService } from '../../core/download/download.service';
import { provideTestI18n, USER_TEXTS } from '../../testing/i18n';
import { BillingPanel } from './billing.panel';

const BALANCE = { balanceEur: 42.5, voiceMinutesRemaining: 87, chatConversationsRemaining: 160 };

const SUBSCRIPTION = {
  id: 3,
  status: 'active',
  renewalDate: '2026-10-01T00:00:00.000Z',
  autoRenew: true,
  plan: { id: 1, name: 'Starter', priceEur: '49.00', billingCycle: 'monthly' },
};

const INVOICE = {
  id: 7,
  invoiceNumber: 'INV-2026-014',
  totalEur: '58.31',
  status: 'paid',
  issuedDate: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const TRANSACTION = {
  id: 11,
  amount: -12.5,
  balanceAfter: 42.5,
  type: 'usage',
  description: null,
  createdAt: '2026-09-10T08:00:00.000Z',
};

interface RenderOptions {
  subscription?: Record<string, unknown> | null;
  invoices?: Record<string, unknown>[];
  transactions?: Record<string, unknown>[];
}

describe('BillingPanel', () => {
  let http: HttpTestingController;
  let saved: { blob: Blob; filename: string } | null;

  beforeEach(async () => {
    saved = null;
    await TestBed.configureTestingModule({
      imports: [BillingPanel, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DownloadService,
          useValue: { save: (blob: Blob, filename: string) => (saved = { blob, filename }) },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(options: RenderOptions = {}) {
    const fixture = TestBed.createComponent(BillingPanel);
    await fixture.whenStable();
    http.expectOne('/api/hub/billing/balance').flush(BALANCE);
    const subscription = options.subscription === undefined ? SUBSCRIPTION : options.subscription;
    const request = http.expectOne('/api/hub/billing/subscription');
    if (subscription) request.flush(subscription);
    else
      request.flush(
        { error: { code: 'not_found', message: 'no plan' } },
        { status: 404, statusText: 'Not Found' },
      );
    http.expectOne('/api/hub/billing/invoices').flush(options.invoices ?? [INVOICE]);
    http
      .expectOne((req) => req.url === '/api/hub/billing/transactions')
      .flush({
        data: options.transactions ?? [TRANSACTION],
        pagination: { page: 1, perPage: 20, total: 1 },
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('shows the plan and the balance of the linked customer', async () => {
    const fixture = await render();

    const plan = fixture.nativeElement.querySelector('[data-testid="billing-plan"]');
    expect(plan.textContent).toContain('Starter');
    expect(plan.textContent).toContain(USER_TEXTS.billing.subscriptionStatuses.active);
    const balance = fixture.nativeElement.querySelector('[data-testid="billing-balance"]');
    expect(balance.textContent).toContain('42,50');
  });

  it('treats an account without a plan as an answer, not a failure', async () => {
    const fixture = await render({ subscription: null });

    expect(fixture.nativeElement.querySelector('[data-testid="billing-no-plan"]').textContent).toContain(
      USER_TEXTS.billing.plan.none,
    );
  });

  it('lists invoices with their translated status', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="invoices-table"] tbody tr');
    expect(row.textContent).toContain('INV-2026-014');
    expect(row.textContent).toContain(USER_TEXTS.billing.invoiceStatuses.paid);
  });

  it('falls back to the transaction type when there is no description', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="transactions-table"] tbody tr');
    expect(row.textContent).toContain(USER_TEXTS.billing.transactionTypes.usage);
  });

  it('shows the empty hints without invoices and movements', async () => {
    const fixture = await render({ invoices: [], transactions: [] });

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.billing.invoices.empty);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.billing.transactions.empty);
  });

  it('downloads the invoice through the portal, never from the hub', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.download(INVOICE);
    const request = http.expectOne('/api/account/invoices/7/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await pending;

    expect(saved?.filename).toBe('INV-2026-014.pdf');
    expect(fixture.componentInstance.downloading()).toBeNull();
  });

  it('asks for the page the paginator selected', async () => {
    const fixture = await render();

    fixture.componentInstance.changePage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = http.expectOne((req) => req.url === '/api/hub/billing/transactions');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('perPage')).toBe('50');
    request.flush({ data: [], pagination: { page: 2, perPage: 50, total: 60 } });
  });
});
