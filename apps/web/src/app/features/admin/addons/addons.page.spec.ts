import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type {
  ResellerAddonPackage,
  ResellerAddonPurchase,
  ResellerAddonStats,
} from '../../../core/hub/hub.models';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminAddonsPage } from './addons.page';

const PACKAGES: ResellerAddonPackage[] = [
  {
    id: 31,
    type: 'voice_minutes',
    name: '500 Minuten',
    quantity: 500,
    totalPrice: 79,
    description: 'Fuer Monate mit viel Betrieb',
  },
  {
    id: 32,
    type: 'chat_conversations',
    name: '1000 Chats',
    quantity: 1000,
    totalPrice: 49,
    description: '',
  },
];

const PURCHASES: ResellerAddonPurchase[] = [
  {
    addon: {
      id: 7,
      customerId: 501,
      addonType: 'voice_minutes',
      quantity: 500,
      unitPriceEur: '0.158',
      totalPriceEur: '79.00',
      status: 'completed',
      paymentDate: '2026-09-10T08:00:00.000Z',
      expiryDate: '2027-09-10T08:00:00.000Z',
      usedAmount: 120,
      createdAt: '2026-09-10T08:00:00.000Z',
      metadata: '{"planId":81,"planName":"500 Extra-Minuten","soldBy":"reseller","resellerId":72}',
    },
    customer: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  },
  {
    addon: {
      id: 8,
      customerId: 502,
      addonType: 'chat_conversations',
      quantity: 1000,
      unitPriceEur: '0.049',
      totalPriceEur: '49.00',
      status: 'failed',
      paymentDate: null,
      expiryDate: null,
      usedAmount: 0,
      createdAt: '2026-09-11T08:00:00.000Z',
    },
    customer: null,
  },
];

const STATS: ResellerAddonStats = {
  totalAddons: 2,
  totalRevenue: 79,
  byType: [{ type: 'voice_minutes', count: 1, revenue: 79 }],
};

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminAddonsPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminAddonsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the three calls a load makes, in whatever order they arrive. */
  async function answerLoad(options: { packages?: unknown[]; purchases?: unknown[]; stats?: unknown } = {}) {
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/addons/packages')
      .flush({ data: options.packages ?? PACKAGES });
    const purchases = http.expectOne((req) => req.url === '/api/admin/hub/resellers/addons/purchases');
    purchases.flush({ data: options.purchases ?? PURCHASES });
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/addons/stats')
      .flush(options.stats ?? STATS);
    await settle();
    return purchases.request;
  }

  async function render(options?: { packages?: unknown[]; purchases?: unknown[]; stats?: unknown }) {
    const fixture = TestBed.createComponent(AdminAddonsPage);
    await fixture.whenStable();
    await answerLoad(options);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const tableOf = (fixture: { nativeElement: HTMLElement }, testId: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"] tbody tr`)) as HTMLElement[];

  it('shows every package that is on offer with its size and price', async () => {
    const fixture = await render();
    const rows = tableOf(fixture, 'packages-table');

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('500 Minuten');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.addons.types.voice_minutes);
    expect(rows[0].textContent).toContain('79,00');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.addons.types.chat_conversations);
  });

  it('shows who bought what, and the address when the hub knows no name', async () => {
    const fixture = await render();
    const rows = tableOf(fixture, 'purchases-table');

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.addons.purchases.statuses.completed);
    expect(rows[0].textContent).toContain('79,00');
    expect(rows[1].textContent).toContain('502');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.addons.purchases.statuses.failed);
  });

  it('names the package that was sold, and falls back to what it contained', async () => {
    const fixture = await render();
    const rows = tableOf(fixture, 'purchases-table');

    expect(rows[0].textContent).toContain('500 Extra-Minuten');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.addons.types.chat_conversations);
  });

  it('counts every sale but takes revenue from the completed ones', async () => {
    const fixture = await render();
    const stats = fixture.nativeElement.querySelector('[data-testid="stats"]') as HTMLElement;

    expect(stats.textContent).toContain('2');
    expect(stats.textContent).toContain('79,00');
    expect(stats.textContent).toContain(ADMIN_TEXTS.addons.types.voice_minutes);
  });

  it('asks the hub for the latest sales only', async () => {
    const fixture = TestBed.createComponent(AdminAddonsPage);
    await fixture.whenStable();
    const request = await answerLoad();

    expect(request.params.get('limit')).toBe('50');
  });

  it('refreshes the sales and the figures after a package was sold', async () => {
    const fixture = await render();
    dialogResult = true;

    fixture.componentInstance.sell();
    await settle();
    await answerLoad();
  });

  it('leaves the lists alone when the sale was called off', async () => {
    const fixture = await render();

    fixture.componentInstance.sell();
    await settle();
    http.expectNone((req) => req.url === '/api/admin/hub/resellers/addons/purchases');
  });

  it('offers the package of the row it was started from', async () => {
    const fixture = await render();
    const opened: unknown[] = [];
    const dialog = TestBed.inject(MatDialog) as unknown as { open: (c: unknown, o: unknown) => unknown };
    dialog.open = (_component: unknown, options: unknown) => {
      opened.push(options);
      return { afterClosed: () => of(undefined) };
    };

    fixture.componentInstance.sell(PACKAGES[1]);

    expect(JSON.stringify(opened[0])).toContain('"packageId":32');
  });

  it('says where packages come from instead of showing an empty table', async () => {
    const fixture = await render({ packages: [], purchases: [] });

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.addons.packages.empty);
    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.addons.purchases.empty);
  });

  it('keeps the rest of the page when the figures cannot be read', async () => {
    const fixture = TestBed.createComponent(AdminAddonsPage);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/addons/packages').flush({ data: PACKAGES });
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/addons/purchases')
      .flush({ data: PURCHASES });
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/addons/stats')
      .flush({ error: { code: 'upstream_error' } }, { status: 502, statusText: 'Bad Gateway' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tableOf(fixture, 'packages-table')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.addons.stats.unavailable);
  });
});
