import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXTS, provideTestI18n, TEXTS } from '../../../testing/i18n';
import { AdminOverviewPage } from './admin-overview.page';

const OVERVIEW = {
  hub: { ok: true, email: 'operator@example.com', checkedAt: '2026-09-17T08:00:00.000Z', error: null },
  users: { total: 3, admins: 1, users: 2, active: 2, invited: 1, disabled: 0 },
};

const STATS = {
  totalCustomers: 12,
  totalVoiceAgents: 7,
  totalChatbots: 4,
  thisMonthUsageCost: 148.4,
};

const BALANCE = { balance: 250.75, currency: 'EUR', formatted: '250,75 €' };
const CREDITS = { voiceMinutesAvailable: 950, chatMessagesAvailable: 540 };
const SUB_COUNT = { count: 9 };

const TICKETS = [
  { id: 1, userId: 501, subject: 'Rechnung', status: 'open' },
  { id: 2, userId: 502, subject: 'Rueckruf', status: 'in_progress' },
  { id: 3, userId: 503, subject: 'Erledigt', status: 'closed' },
];

interface Parts {
  stats?: unknown;
  statsStatus?: number;
  tickets?: unknown[];
  ticketTotal?: number;
  subCount?: number;
}

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminOverviewPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminOverviewPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(parts: Parts = {}) {
    const fixture = TestBed.createComponent(AdminOverviewPage);
    await fixture.whenStable();
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    // The operator tiles are only asked for once the local overview has answered.
    await settle();
    const stats = http.expectOne('/api/admin/hub/resellers/stats');
    if (parts.statsStatus)
      stats.flush(
        { error: { code: 'forbidden', message: 'no' } },
        { status: parts.statsStatus, statusText: 'x' },
      );
    else stats.flush(parts.stats ?? STATS);
    http.expectOne('/api/admin/hub/resellers/balance').flush(BALANCE);
    http.expectOne('/api/admin/hub/resellers/credits/balance').flush(CREDITS);
    http
      .expectOne('/api/admin/hub/resellers/subscriptions/count')
      .flush(parts.subCount === undefined ? SUB_COUNT : { count: parts.subCount });
    const tickets = parts.tickets ?? TICKETS;
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/tickets')
      .flush({
        data: tickets,
        pagination: { page: 1, perPage: 100, total: parts.ticketTotal ?? tickets.length },
      });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: Awaited<ReturnType<typeof render>>, testId: string): string {
    const el = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('shows the operator figures next to the local ones', async () => {
    const fixture = await render();

    expect(text(fixture, 'tile-customers')).toContain('12');
    expect(text(fixture, 'tile-customers')).toContain('7');
    expect(text(fixture, 'tile-customers')).toContain('4');
    expect(text(fixture, 'tile-balance')).toContain('€250.75');
    expect(text(fixture, 'tile-balance')).toContain('950');
    expect(text(fixture, 'tile-subscriptions')).toContain('9');
    expect(text(fixture, 'hub-card')).toContain('operator@example.com');
  });

  it('counts the tickets that are not closed', async () => {
    const fixture = await render();

    expect(text(fixture, 'tile-tickets')).toContain('2');
  });

  it('marks the ticket count as a lower bound when the first page is not the whole book', async () => {
    const fixture = await render({ ticketTotal: 240 });

    expect(text(fixture, 'tile-tickets')).toContain('2+');
  });

  it('shows a fresh operator without subscriptions the zero, not an outage', async () => {
    const fixture = await render({ subCount: 0 });

    expect(text(fixture, 'tile-subscriptions')).toContain('0');
    expect(text(fixture, 'tile-subscriptions')).not.toContain(ADMIN_TEXTS.overview.unavailable);
  });

  it('keeps the other tiles filled when one hub call fails', async () => {
    const fixture = await render({ statsStatus: 403 });

    expect(text(fixture, 'tile-customers')).toContain('–');
    expect(text(fixture, 'tile-balance')).toContain('€250.75');
    expect(text(fixture, 'tile-subscriptions')).toContain('9');
  });

  it('shows a dash instead of NaN when the service answers without a figure', async () => {
    // A portal talks to installations it does not control, and an older one can
    // answer a tile's call without the number the tile is about.
    const fixture = await render({ stats: {} });

    expect(text(fixture, 'tile-customers')).toContain('–');
    expect(text(fixture, 'tile-customers')).not.toContain('NaN');
  });

  it('lists the open tickets under their count and leaves the closed ones out', async () => {
    const fixture = await render();

    const table = text(fixture, 'open-tickets');
    expect(table).toContain('Rechnung');
    expect(table).toContain('Rueckruf');
    expect(table).not.toContain('Erledigt');
    expect(table).toContain(ADMIN_TEXTS.tickets.statuses.in_progress);
  });

  it('says so when no ticket is waiting', async () => {
    const fixture = await render({ tickets: [] });

    expect(text(fixture, 'tile-tickets')).toContain('0');
    expect(text(fixture, 'open-tickets')).toContain(ADMIN_TEXTS.overview.tickets.none);
  });

  it("counts the portal's own accounts beside the operator figures", async () => {
    const fixture = await render();

    const panel = text(fixture, 'tile-users');
    expect(panel).toContain('3');
    expect(panel).toContain('1 ' + TEXTS.roles.admin);
    expect(panel).toContain('1 ' + TEXTS.statuses.invited);
  });

  it('names the connection and the account it uses in the strip', async () => {
    const fixture = await render();

    const strip = text(fixture, 'hub-card');
    expect(strip).toContain(ADMIN_TEXTS.overview.hub.connected);
    expect(strip).toContain('operator@example.com');
    expect(fixture.nativeElement.querySelector('[data-testid="hub-card"].strip-bad')).toBeNull();
  });
});
