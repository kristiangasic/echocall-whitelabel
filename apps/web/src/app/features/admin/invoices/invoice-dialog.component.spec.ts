import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n } from '../../../testing/i18n';
import { InvoiceDialogComponent } from './invoice-dialog.component';

const CUSTOMERS = [
  { id: 4, userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
  { id: 5, userId: 502, user: { id: 502, email: 'ben@example.com' } },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('InvoiceDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  beforeEach(async () => {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [InvoiceDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: {} },
        {
          provide: MatDialogRef,
          useValue: {
            close: (value: unknown) => {
              closed = value;
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(InvoiceDialogComponent);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  it('offers every customer of the operator', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.customers()).toEqual([
      { id: 501, label: 'Lina Mayer (lina@example.com)' },
      { id: 502, label: 'ben@example.com' },
    ]);
  });

  it('opens with one line item and today as the invoice date', async () => {
    const fixture = await render();
    const value = fixture.componentInstance.form.getRawValue();

    expect(value.items).toHaveLength(1);
    expect(value.items[0].itemType).toBe('other');
    expect(value.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(value.taxRate).toBe(19);
  });

  it('adds and removes line items, but never the last one', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.addItem();
    expect(page.items.length).toBe(2);

    page.removeItem(0);
    expect(page.items.length).toBe(1);

    page.removeItem(0);
    expect(page.items.length).toBe(1);
  });

  it('adds up the line items and the tax as they are typed', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.items.at(0).patchValue({ quantity: 3, unitPrice: 10 });
    page.addItem();
    page.items.at(1).patchValue({ quantity: 2, unitPrice: 5.5 });
    page.form.patchValue({ taxRate: 19 });
    fixture.detectChanges();

    expect(page.net()).toBeCloseTo(41, 2);
    expect(page.tax()).toBeCloseTo(7.79, 2);
    expect(page.gross()).toBeCloseTo(48.79, 2);
  });

  it('refuses to send an invoice without a customer', async () => {
    const fixture = await render();

    await fixture.componentInstance.submit();
    await settle();

    http.expectNone('/api/admin/hub/resellers/invoices');
  });

  it('sends the typed line items and reports the number back', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.form.patchValue({ customerId: 501, invoiceDate: '2026-09-17', dueDate: '2026-10-01', taxRate: 19 });
    page.items.at(0).patchValue({
      description: 'September',
      quantity: 2,
      unitPrice: 50,
      itemType: 'subscription',
    });

    void page.submit();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/invoices');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      customerId: 501,
      invoiceDate: '2026-09-17',
      dueDate: '2026-10-01',
      taxRate: 19,
      items: [{ description: 'September', quantity: 2, unitPrice: 50, itemType: 'subscription' }],
    });

    request.flush({ success: true, invoiceId: 31, invoiceNumber: 'R7-202609-0003' });
    await settle();

    expect(closed).toEqual({ invoiceId: 31, invoiceNumber: 'R7-202609-0003' });
  });

  it('leaves out a due date and a note that were not filled in', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.form.patchValue({ customerId: 502, invoiceDate: '2026-09-17', taxRate: 0 });
    page.items.at(0).patchValue({ description: 'Beratung', quantity: 1, unitPrice: 80 });

    void page.submit();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/invoices');

    expect(request.request.body).not.toHaveProperty('dueDate');
    expect(request.request.body).not.toHaveProperty('notes');
    request.flush({ success: true, invoiceId: 32, invoiceNumber: 'R7-202609-0004' });
    await settle();
  });

  it('stays open when the hub refuses the invoice', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.form.patchValue({ customerId: 501, invoiceDate: '2026-09-17' });
    page.items.at(0).patchValue({ description: 'September', quantity: 1, unitPrice: 10 });

    void page.submit();
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/invoices')
      .flush({ error: { code: 'not_found' } }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(closed).toBeUndefined();
    expect(page.busy()).toBe(false);
  });
});
