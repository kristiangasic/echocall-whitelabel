import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { UserDashboardPage } from './user-dashboard.page';

const OVERVIEW = {
  profile: { id: 7, role: 'customer', email: 'kunde@example.com', name: 'Kunde' },
  usage: {
    period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' },
    voiceMinutesUsed: 42,
    chatSessionsUsed: 8,
  },
  limits: {
    accountStatus: 'active',
    balanceEur: 19.5,
    voiceMinutesRemaining: 58,
    plan: { name: 'Business', voiceMinutesPerMonth: 100 },
  },
};

const CONVERSATION = {
  type: 'voice',
  id: 31,
  direction: 'inbound',
  fromNumber: '+4930111111',
  toNumber: '+4930222222',
  status: 'completed',
  createdAt: '2026-09-17T08:00:00.000Z',
};

describe('UserDashboardPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserDashboardPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(conversations: Record<string, unknown>[] = [CONVERSATION]) {
    const fixture = TestBed.createComponent(UserDashboardPage);
    await fixture.whenStable();
    http.expectOne('/api/account/overview').flush(OVERVIEW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const recent = http.expectOne((req) => req.url === '/api/hub/conversations');
    expect(recent.request.params.get('perPage')).toBe('5');
    recent.flush({ data: conversations });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('shows the usage tiles and the balance', async () => {
    const fixture = await render();

    const tiles = fixture.nativeElement.querySelector('[data-testid="tiles"]');
    expect(tiles.textContent).toContain('42');
    expect(tiles.textContent).toContain('19,50');
    expect(tiles.textContent).toContain('Business');
  });

  it('keeps quiet about a remainder an account pays from its balance', async () => {
    const fixture = TestBed.createComponent(UserDashboardPage);
    await fixture.whenStable();
    http.expectOne('/api/account/overview').flush({
      ...OVERVIEW,
      limits: { accountStatus: 'active', balanceEur: 50, voiceMinutesRemaining: 0, plan: null },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne((req) => req.url === '/api/hub/conversations').flush({ data: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const tiles = fixture.nativeElement.querySelector('[data-testid="tiles"]');
    expect(tiles.textContent).not.toContain('Noch 0 Minuten');
    expect(tiles.textContent).toContain(USER_TEXTS.dashboard.plan.none);
  });

  it('says what the status on the plan tile is about', async () => {
    const fixture = await render();

    const tiles = fixture.nativeElement.querySelector('[data-testid="tiles"]');
    expect(tiles.textContent).toContain(USER_TEXTS.dashboard.statuses.active);
    expect(USER_TEXTS.dashboard.statuses.active).toBe('Konto aktiv');
  });

  it('lists the most recent conversations', async () => {
    const fixture = await render();

    const list = fixture.nativeElement.querySelector('[data-testid="recent-conversations"]');
    expect(list.textContent).toContain('+4930111111');
  });

  it('shows the empty hint without conversations', async () => {
    const fixture = await render([]);

    expect(
      fixture.nativeElement.querySelector('[data-testid="recent-conversations"]').textContent,
    ).toContain(USER_TEXTS.dashboard.recent.empty);
  });

  it('keeps the tiles when the conversation list fails', async () => {
    const fixture = TestBed.createComponent(UserDashboardPage);
    await fixture.whenStable();
    http.expectOne('/api/account/overview').flush(OVERVIEW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/conversations')
      .flush({ error: { code: 'hub_unreachable' } }, { status: 502, statusText: 'Bad Gateway' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="tiles"]')).not.toBeNull();
    expect(fixture.componentInstance.recent()).toEqual([]);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('points at the linking hint when the account is not connected', async () => {
    const fixture = TestBed.createComponent(UserDashboardPage);
    await fixture.whenStable();
    http
      .expectOne('/api/account/overview')
      .flush({ error: { code: 'customer_not_linked' } }, { status: 409, statusText: 'Conflict' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="not-linked"]')).not.toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
