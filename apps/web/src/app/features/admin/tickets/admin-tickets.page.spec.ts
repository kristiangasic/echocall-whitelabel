import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ResellerTicketRow } from '../../../core/hub/hub.models';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminTicketsPage } from './admin-tickets.page';

const ROWS: ResellerTicketRow[] = [
  {
    id: 31,
    userId: 501,
    resellerId: 7,
    subject: 'Anruf bricht ab',
    description: 'Der Anruf endet nach zehn Sekunden.',
    category: 'technical',
    priority: 'high',
    status: 'open',
    assignedToAdmin: null,
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
  },
  {
    id: 32,
    userId: 502,
    resellerId: 7,
    subject: 'Rechnung falsch',
    description: 'Die Summe stimmt nicht.',
    category: 'billing',
    priority: 'low',
    status: 'resolved',
    assignedToAdmin: 1,
    createdAt: '2026-09-14T08:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  },
];

const CUSTOMERS = [
  { id: 4, userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminTicketsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminTicketsPage, provideTestI18n()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the ticket list; the customer picker is answered only on the first load. */
  async function answerLoad(total = ROWS.length, rows: unknown[] = ROWS, withCustomers = false) {
    if (withCustomers) {
      http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    }
    const request = http.expectOne((req) => req.url === '/api/admin/hub/resellers/tickets');
    request.flush({
      data: rows,
      pagination: { page: Number(request.request.params.get('page')), perPage: 25, total },
    });
    await settle();
    return request.request;
  }

  async function render() {
    const fixture = TestBed.createComponent(AdminTicketsPage);
    await fixture.whenStable();
    await answerLoad(ROWS.length, ROWS, true);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('shows the subject, the customer, the priority and the status', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Anruf bricht ab');
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.tickets.priorities.high);
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.tickets.statuses.open);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.tickets.statuses.resolved);
  });

  it('marks a ticket that was handed to platform support', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows[0].textContent).not.toContain(ADMIN_TEXTS.tickets.escalatedBadge);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.tickets.escalatedBadge);
  });

  it('takes both filters to the hub and starts over on the first page', async () => {
    const fixture = await render();

    fixture.componentInstance.setStatus('open');
    let request = await answerLoad(1);
    expect(request.params.get('status')).toBe('open');
    expect(request.params.get('page')).toBe('1');

    fixture.componentInstance.setCustomer(501);
    request = await answerLoad(1);
    expect(request.params.get('customerId')).toBe('501');
    expect(request.params.get('status')).toBe('open');
  });

  it('asks the hub for the next page when the paginator moves', async () => {
    const fixture = await render();

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = await answerLoad(60);

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('perPage')).toBe('50');
  });

  it('links every row to the conversation', async () => {
    const fixture = await render();
    const link = rowsOf(fixture)[0].querySelector('a');

    expect(link?.getAttribute('href')).toBe('/admin/tickets/31');
  });

  it('keeps the list usable when the customer names cannot be read', async () => {
    const fixture = TestBed.createComponent(AdminTicketsPage);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/customers')
      .flush({ error: { code: 'internal_error' } }, { status: 500, statusText: 'Server Error' });
    await answerLoad();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rowsOf(fixture)).toHaveLength(2);
    expect(rowsOf(fixture)[0].textContent).toContain('501');
  });

  it('says so instead of showing an empty table', async () => {
    const fixture = TestBed.createComponent(AdminTicketsPage);
    await fixture.whenStable();
    await answerLoad(0, [], true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.tickets.empty);
  });
});
