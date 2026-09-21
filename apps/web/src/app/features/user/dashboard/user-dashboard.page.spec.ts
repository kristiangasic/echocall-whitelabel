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

const CALL = {
  type: 'voice',
  id: 31,
  direction: 'inbound',
  fromNumber: '+4930111111',
  toNumber: '+4930222222',
  duration: 214,
  status: 'completed',
  createdAt: '2026-09-17T08:00:00.000Z',
};

const CHAT = {
  type: 'chat',
  id: 32,
  chatbotId: 7,
  channel: 'widget',
  status: 'closed',
  visitorId: 'v-1',
  visitorName: 'Ellen Ward',
  createdAt: '2026-09-17T09:00:00.000Z',
};

/** The day as the component writes it, in the machine's own time zone. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysAgo(count: number): string {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return dayKey(date);
}

const DAILY = [
  { date: daysAgo(0), callCount: 3 },
  { date: daysAgo(1), callCount: 1 },
];

/** A text from the English bundle with its placeholders filled in, as the page renders it. */
function filled(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
    template,
  );
}

interface Parts {
  overview?: Record<string, unknown>;
  conversations?: Record<string, unknown>[];
  conversationsStatus?: number;
  daily?: Record<string, unknown>[];
  dailyStatus?: number;
}

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  async function render(parts: Parts = {}) {
    const fixture = TestBed.createComponent(UserDashboardPage);
    await fixture.whenStable();
    http.expectOne('/api/account/overview').flush(parts.overview ?? OVERVIEW);
    await settle();
    // The list and the chart are asked for together, once the account has answered.
    const recent = http.expectOne((req) => req.url === '/api/hub/conversations');
    expect(recent.request.params.get('perPage')).toBe('5');
    if (parts.conversationsStatus)
      recent.flush(
        { error: { code: 'hub_unreachable' } },
        { status: parts.conversationsStatus, statusText: 'Bad Gateway' },
      );
    else recent.flush({ data: parts.conversations ?? [CALL, CHAT] });
    const calls = http.expectOne((req) => req.url === '/api/hub/analytics/daily');
    expect(calls.request.params.get('days')).toBe('30');
    if (parts.dailyStatus)
      calls.flush({ error: { code: 'not_found' } }, { status: parts.dailyStatus, statusText: 'Not Found' });
    else calls.flush({ days: 30, agentId: null, data: parts.daily ?? DAILY });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: Awaited<ReturnType<typeof render>>, testId: string): string {
    const el = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('puts the plan, the status and the balance in the account strip', async () => {
    const fixture = await render();

    const strip = text(fixture, 'account');
    expect(strip).toContain('Business');
    expect(strip).toContain(USER_TEXTS.dashboard.statuses.active);
    expect(strip).toContain('19.50');
  });

  it('measures the minutes against the monthly allowance', async () => {
    const fixture = await render();

    const panel = text(fixture, 'voice-panel');
    expect(panel).toContain('42');
    expect(panel).toContain(filled(USER_TEXTS.dashboard.voice.remaining, { count: 58 }));
    expect(panel).toContain(filled(USER_TEXTS.dashboard.voice.ofAllowance, { percent: 42, count: 100 }));
    const fill = fixture.nativeElement.querySelector(
      '[data-testid="voice-panel"] .meter-fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('42%');
  });

  it('keeps quiet about a remainder an account pays from its balance', async () => {
    const fixture = await render({
      overview: {
        ...OVERVIEW,
        limits: { accountStatus: 'active', balanceEur: 50, voiceMinutesRemaining: 0, plan: null },
      },
    });

    const panel = text(fixture, 'voice-panel');
    expect(panel).not.toContain(filled(USER_TEXTS.dashboard.voice.remaining, { count: 0 }));
    expect(panel).toContain(USER_TEXTS.dashboard.fromBalance);
    expect(fixture.nativeElement.querySelector('[data-testid="voice-panel"] .meter')).toBeNull();
    expect(text(fixture, 'account')).toContain(USER_TEXTS.dashboard.plan.none);
  });

  it('measures the chats the same way once the plan includes some', async () => {
    const fixture = await render({
      overview: {
        ...OVERVIEW,
        limits: {
          ...OVERVIEW.limits,
          chatConversationsRemaining: 42,
          plan: { name: 'Business', voiceMinutesPerMonth: 100, chatConversationsPerMonth: 50 },
        },
      },
    });

    const panel = text(fixture, 'chat-panel');
    expect(panel).toContain('8');
    expect(panel).toContain(filled(USER_TEXTS.dashboard.chat.remaining, { count: 42 }));
    expect(panel).toContain(filled(USER_TEXTS.dashboard.chat.ofAllowance, { percent: 16, count: 50 }));
  });

  it('draws the calls of the last thirty days and adds them up', async () => {
    const fixture = await render();

    expect(text(fixture, 'calls-per-day')).toContain(filled(USER_TEXTS.dashboard.voice.calls, { count: 4 }));
    const bars = fixture.nativeElement.querySelectorAll('[data-testid="calls-per-day"] .spark-bar');
    expect(bars.length).toBe(30);
    // Today is the busiest day, so its bar is the full height.
    expect((bars[29] as HTMLElement).style.height).toBe('100%');
  });

  it('says there were no calls when the window is empty', async () => {
    const fixture = await render({ daily: [] });

    expect(text(fixture, 'calls-per-day')).toContain(
      filled(USER_TEXTS.dashboard.voice.noCalls, { days: 30 }),
    );
    expect(fixture.nativeElement.querySelector('.spark-bar')).toBeNull();
  });

  it('leaves the chart out when the service has no daily figures', async () => {
    const fixture = await render({ dailyStatus: 404 });

    expect(fixture.nativeElement.querySelector('[data-testid="calls-per-day"]')).toBeNull();
    expect(text(fixture, 'voice-panel')).toContain('42');
  });

  it('lists the most recent conversations as a table', async () => {
    const fixture = await render();

    const table = text(fixture, 'recent-conversations');
    expect(table).toContain('+4930111111');
    expect(table).toContain('3:34');
    expect(table).toContain('Ellen Ward');
    expect(table).toContain(USER_TEXTS.dashboard.kinds.voice);
    expect(table).toContain(USER_TEXTS.dashboard.kinds.chat);
    expect(table).toContain(USER_TEXTS.conversations.statuses.completed);
    expect(table).toContain(USER_TEXTS.conversations.statuses.closed);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="recent-conversations"] tr[mat-row]').length,
    ).toBe(2);
  });

  it('shows the empty hint without conversations', async () => {
    const fixture = await render({ conversations: [] });

    expect(text(fixture, 'recent-empty')).toContain(USER_TEXTS.dashboard.recent.empty);
  });

  it('keeps the figures when the conversation list fails', async () => {
    const fixture = await render({ conversationsStatus: 502 });

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
    await settle();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="not-linked"]')).not.toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
