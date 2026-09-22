import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DownloadService } from '../../../core/download/download.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminInvoiceDetailPage } from './invoice-detail.page';

const DETAIL = {
  invoice: {
    id: 21,
    userId: 501,
    resellerId: 7,
    invoiceNumber: 'R7-202609-0001',
    description: 'September',
    subtotalEur: '100.00',
    taxEur: '19.00',
    totalEur: '119.00',
    status: 'sent',
    issuedDate: '2026-09-01T00:00:00.000Z',
    dueDate: '2026-09-15T00:00:00.000Z',
    paidDate: null,
    billingPeriodStart: '2026-09-01T00:00:00.000Z',
    billingPeriodEnd: '2026-09-30T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  customer: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  items: [
    {
      id: 1,
      invoiceId: 21,
      description: 'Tarif Business',
      quantity: '2',
      unitPrice: '40.00',
      amount: '80.00',
      itemType: 'subscription',
    },
    {
      id: 2,
      invoiceId: 21,
      description: 'Sprachminuten',
      quantity: '100',
      unitPrice: '0.20',
      amount: '20.00',
      itemType: 'voice_minutes',
    },
  ],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminInvoiceDetailPage', () => {
  let http: HttpTestingController;
  let saved: { name: string; type: string }[];
  let errors: string[];

  beforeEach(async () => {
    saved = [];
    errors = [];
    await TestBed.configureTestingModule({
      imports: [AdminInvoiceDetailPage, provideTestI18n()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '21' }) } } },
        {
          provide: DownloadService,
          useValue: { save: (blob: Blob, name: string) => saved.push({ name, type: blob.type }) },
        },
        {
          provide: NotifyService,
          useValue: {
            error: (key: string) => errors.push(key),
            errorKey: (code: string) => 'errors.' + code,
            success: () => undefined,
            apiError: () => undefined,
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(body: object = DETAIL, status = 200) {
    const fixture = TestBed.createComponent(AdminInvoiceDetailPage);
    await fixture.whenStable();
    const request = http.expectOne('/api/admin/hub/resellers/invoices/21');
    if (status === 200) request.flush(body);
    else request.flush(body, { status, statusText: 'Not Found' });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  it('names the invoice, its customer and its state', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('R7-202609-0001');
    expect(text).toContain('Lina Mayer');
    expect(text).toContain(ADMIN_TEXTS.invoices.statuses.sent);
  });

  it('shows a state it does not know as it came, not as a key', async () => {
    const fixture = await render({ ...DETAIL, invoice: { ...DETAIL.invoice, status: 'disputed' } });
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('disputed');
    expect(text).not.toContain('admin.invoices.statuses');
  });

  it('lists the line items with their kind and their amounts', async () => {
    const fixture = await render();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Tarif Business');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.invoices.itemTypes.subscription);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.invoices.itemTypes.voice_minutes);
    expect(rows[1].textContent).toContain('0.20');
  });

  it('shows the net, the tax and the gross the hub stored', async () => {
    const fixture = await render();
    const totals = fixture.nativeElement.querySelector('[data-testid="totals"]') as HTMLElement;

    expect(totals.textContent).toContain('100.00');
    expect(totals.textContent).toContain('19.00');
    expect(totals.textContent).toContain('119.00');
  });

  it('says so instead of showing an empty item table', async () => {
    const fixture = await render({ ...DETAIL, items: [] });

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.invoices.detail.noItems);
  });

  it('says so when the invoice is not there', async () => {
    const fixture = await render({ error: { code: 'not_found' } }, 404);

    expect(fixture.nativeElement.querySelector('[data-testid="missing"]')?.textContent).toContain(
      ADMIN_TEXTS.invoices.detail.notFound,
    );
  });

  // The invoice page is where a partner reads a document; it must hand it out
  // there too, through the portal, since a hub link would need a hub session.
  it('downloads the document from the invoice page and names it after the invoice', async () => {
    const fixture = await render();
    const button = fixture.nativeElement.querySelector('[data-testid="download-pdf"]') as HTMLButtonElement;

    button.click();
    await settle();
    const request = http.expectOne('/api/admin/invoices/21/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await settle();

    expect(saved).toEqual([{ name: 'R7-202609-0001.pdf', type: 'application/pdf' }]);
    expect(fixture.componentInstance.downloading()).toBe(false);
  });

  it('reports what the refusal said instead of a generic failure', async () => {
    const fixture = await render();

    const loaded = fixture.componentInstance.detail();
    if (!loaded) throw new Error('the invoice did not load');

    const done = fixture.componentInstance.download(loaded);
    await settle();
    http.expectOne('/api/admin/invoices/21/pdf').flush(
      new Blob([JSON.stringify({ error: { code: 'company_details_incomplete', message: 'incomplete' } })], {
        type: 'application/json',
      }),
      { status: 409, statusText: 'Conflict' },
    );
    await done;

    expect(errors).toEqual(['errors.company_details_incomplete']);
    expect(saved).toEqual([]);
    expect(fixture.componentInstance.downloading()).toBe(false);
  });
});
