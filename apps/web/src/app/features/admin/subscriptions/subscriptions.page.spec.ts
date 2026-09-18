import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type { ResellerSubscriptionRow } from '../../../core/hub/hub.models';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminSubscriptionsPage } from './subscriptions.page';

const ROWS: ResellerSubscriptionRow[] = [
  {
    subscription: {
      id: 11,
      customerId: 501,
      planId: 1,
      status: 'active',
      contractDuration: 12,
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2027-08-01T00:00:00.000Z',
    },
    customer: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
    plan: { id: 1, name: 'Starter', priceEur: '49.00', billingCycle: 'monthly' },
  },
  {
    subscription: {
      id: 12,
      customerId: 502,
      planId: 9,
      status: 'canceled',
      contractDuration: 3,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-08-01T00:00:00.000Z',
    },
    customer: { id: 502, email: 'timo@example.com', name: null },
    plan: null,
  },
];

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminSubscriptionsPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminSubscriptionsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the one call a load makes and hands back what the hub was asked for. */
  async function answerLoad(total = ROWS.length, rows: unknown[] = ROWS) {
    const request = http.expectOne((req) => req.url === '/api/admin/hub/resellers/subscriptions');
    request.flush({
      data: rows,
      pagination: { page: Number(request.request.params.get('page')), perPage: 25, total },
    });
    await settle();
    return request.request;
  }

  async function render() {
    const fixture = TestBed.createComponent(AdminSubscriptionsPage);
    await fixture.whenStable();
    await answerLoad();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('shows the customer, the plan, the term and the status of every subscription', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[0].textContent).toContain('Starter');
    expect(rows[0].textContent).toContain('49.00');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.subscriptions.statuses.active);
    expect(rows[1].textContent).toContain('timo@example.com');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.subscriptions.planGone);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.subscriptions.statuses.canceled);
  });

  it('asks the first page with the page size the paginator shows', async () => {
    const fixture = TestBed.createComponent(AdminSubscriptionsPage);
    await fixture.whenStable();
    const request = await answerLoad();

    expect(request.params.get('page')).toBe('1');
    expect(request.params.get('perPage')).toBe('25');
    expect(request.params.has('status')).toBe(false);
  });

  it('takes the status filter to the hub and starts over on the first page', async () => {
    const fixture = await render();
    fixture.componentInstance.onPage({ pageIndex: 2, pageSize: 25, length: 80 });
    await answerLoad(80);

    fixture.componentInstance.setStatus('canceled');
    const request = await answerLoad(3);

    expect(request.params.get('status')).toBe('canceled');
    expect(request.params.get('page')).toBe('1');
  });

  it('asks the hub for the next page when the paginator moves', async () => {
    const fixture = await render();

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 60 });
    const request = await answerLoad(60);

    expect(request.params.get('page')).toBe('2');
    expect(request.params.get('perPage')).toBe('50');
  });

  it('cancels with notice only after the confirmation was accepted', async () => {
    const fixture = await render();

    fixture.componentInstance.cancel(ROWS[0], false);
    await settle();
    http.expectNone('/api/admin/hub/resellers/subscriptions/11/cancel');

    dialogResult = true;
    fixture.componentInstance.cancel(ROWS[0], false);
    await settle();
    const cancelled = http.expectOne('/api/admin/hub/resellers/subscriptions/11/cancel');
    expect(cancelled.request.method).toBe('POST');
    cancelled.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('ends a subscription at once through its own endpoint', async () => {
    const fixture = await render();
    dialogResult = true;

    fixture.componentInstance.cancel(ROWS[0], true);
    await settle();
    const ended = http.expectOne('/api/admin/hub/resellers/subscriptions/11/cancel-immediate');

    expect(ended.request.method).toBe('POST');
    ended.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('warns that ending at once cannot be undone', async () => {
    const fixture = await render();
    const opened: unknown[] = [];
    const dialog = TestBed.inject(MatDialog) as unknown as { open: (c: unknown, o: unknown) => unknown };
    dialog.open = (_component: unknown, options: unknown) => {
      opened.push(options);
      return { afterClosed: () => of(undefined) };
    };

    fixture.componentInstance.cancel(ROWS[0], false);
    fixture.componentInstance.cancel(ROWS[0], true);

    expect(opened).toHaveLength(2);
    expect(JSON.stringify(opened[0])).toContain('admin.subscriptions.cancelMessage');
    expect(JSON.stringify(opened[1])).toContain('admin.subscriptions.cancelImmediateMessage');
  });

  it('reloads the list after a subscription was created', async () => {
    const fixture = await render();
    dialogResult = true;

    fixture.componentInstance.create();
    await settle();
    await answerLoad();
  });

  it('says so instead of showing an empty table', async () => {
    const fixture = TestBed.createComponent(AdminSubscriptionsPage);
    await fixture.whenStable();
    await answerLoad(0, []);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.subscriptions.empty);
  });
});
