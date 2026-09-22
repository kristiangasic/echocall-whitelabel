import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DownloadService } from '../../../core/download/download.service';
import type { ResellerInvoiceRow } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminInvoicesPage } from './invoices.page';

const ROWS: ResellerInvoiceRow[] = [
  {
    invoice: {
      id: 21,
      userId: 501,
      resellerId: 7,
      invoiceNumber: 'R7-202609-0001',
      description: 'September',
      subtotalEur: '100.00',
      taxEur: '19.00',
      totalEur: '119.00',
      status: 'draft',
      issuedDate: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-09-15T00:00:00.000Z',
      paidDate: null,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    customer: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  },
  {
    invoice: {
      id: 22,
      userId: 502,
      resellerId: 7,
      invoiceNumber: 'R7-202609-0002',
      description: null,
      subtotalEur: '50.00',
      taxEur: '0.00',
      totalEur: '50.00',
      status: 'paid',
      issuedDate: '2026-09-02T00:00:00.000Z',
      dueDate: null,
      paidDate: '2026-09-05T00:00:00.000Z',
      createdAt: '2026-09-02T00:00:00.000Z',
    },
    customer: null,
  },
];

const CUSTOMERS = [
  { id: 4, userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminInvoicesPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;
  let saved: { name: string; type: string }[];
  let errors: string[];

  beforeEach(async () => {
    dialogResult = undefined;
    saved = [];
    errors = [];
    await TestBed.configureTestingModule({
      imports: [AdminInvoicesPage, provideTestI18n()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        {
          provide: DownloadService,
          useValue: { save: (blob: Blob, name: string) => saved.push({ name, type: blob.type }) },
        },
        {
          provide: NotifyService,
          useValue: {
            error: (key: string) => errors.push(key),
            errorKey: (code: string) => 'errors.' + code,
            success: () => {},
            apiError: () => {},
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the invoice page; the customer picker is answered only on the first load. */
  async function answerLoad(total = ROWS.length, rows: unknown[] = ROWS, withCustomers = false) {
    if (withCustomers) {
      http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    }
    const request = http.expectOne((req) => req.url === '/api/admin/hub/resellers/invoices');
    request.flush({
      data: rows,
      pagination: { page: Number(request.request.params.get('page')), perPage: 25, total },
    });
    await settle();
    return request.request;
  }

  async function render() {
    const fixture = TestBed.createComponent(AdminInvoicesPage);
    await fixture.whenStable();
    await answerLoad(ROWS.length, ROWS, true);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('shows the number, the customer, the totals and the status', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('R7-202609-0001');
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[0].textContent).toContain('119.00');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.invoices.statuses.draft);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.invoices.statuses.paid);
  });

  it('takes both filters to the hub and starts over on the first page', async () => {
    const fixture = await render();

    fixture.componentInstance.setStatus('paid');
    let request = await answerLoad(1);
    expect(request.params.get('status')).toBe('paid');
    expect(request.params.get('page')).toBe('1');

    fixture.componentInstance.setCustomer(501);
    request = await answerLoad(1);
    expect(request.params.get('customerId')).toBe('501');
    expect(request.params.get('status')).toBe('paid');
  });

  it('asks the hub for the next page when the paginator moves', async () => {
    const fixture = await render();

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = await answerLoad(60);

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('perPage')).toBe('50');
  });

  it('records an invoice as sent and reloads', async () => {
    const fixture = await render();

    fixture.componentInstance.markSent(ROWS[0]);
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/invoices/21/mark-sent');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('asks before recording a payment', async () => {
    const fixture = await render();

    fixture.componentInstance.markPaid(ROWS[0]);
    await settle();
    http.expectNone('/api/admin/hub/resellers/invoices/21/mark-paid');

    dialogResult = true;
    fixture.componentInstance.markPaid(ROWS[0]);
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/invoices/21/mark-paid');
    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('offers neither action on an invoice that is already paid', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.canMarkSent(ROWS[0])).toBe(true);
    expect(fixture.componentInstance.canMarkPaid(ROWS[0])).toBe(true);
    expect(fixture.componentInstance.canMarkSent(ROWS[1])).toBe(false);
    expect(fixture.componentInstance.canMarkPaid(ROWS[1])).toBe(false);
  });

  it('reloads after an invoice was created', async () => {
    const fixture = await render();
    dialogResult = { invoiceNumber: 'R7-202609-0003' };

    fixture.componentInstance.create();
    await settle();
    await answerLoad();
  });

  it('says so instead of showing an empty table', async () => {
    const fixture = TestBed.createComponent(AdminInvoicesPage);
    await fixture.whenStable();
    await answerLoad(0, [], true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.invoices.empty);
  });

  // The hub answers a proxied call with a link into its own session, which a
  // portal browser cannot open, so the document comes through the portal.
  it('downloads the document through the portal and names it after the invoice', async () => {
    const fixture = await render();

    const done = fixture.componentInstance.download(ROWS[0]);
    await settle();
    const request = http.expectOne('/api/admin/invoices/21/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await done;

    expect(saved).toEqual([{ name: 'R7-202609-0001.pdf', type: 'application/pdf' }]);
    expect(fixture.componentInstance.downloading()).toBeNull();
  });

  // A failed blob request carries its envelope as a Blob, which reads as
  // 'unknown' unless it is parsed - the operator would never learn what to fix.
  it('reports what the refusal said instead of a generic failure', async () => {
    const fixture = await render();

    const done = fixture.componentInstance.download(ROWS[0]);
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
    expect(fixture.componentInstance.downloading()).toBeNull();
  });
});
