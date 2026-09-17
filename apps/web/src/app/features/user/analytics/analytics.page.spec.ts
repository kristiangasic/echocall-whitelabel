import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { AnalyticsPage } from './analytics.page';

const SUMMARY = {
  period: { from: '2026-08-18T00:00:00.000Z', to: '2026-09-17T00:00:00.000Z' },
  metrics: [
    {
      usageType: 'voice_minute',
      totalQuantity: 128.5,
      totalRevenue: 25.7,
      totalCost: 9.1,
      totalMargin: 16.6,
    },
  ],
};

const DAILY = [
  {
    date: '2026-09-16',
    callCount: 4,
    successfulCalls: 3,
    failedCalls: 1,
    averageDuration: 95,
    successRate: 0.75,
  },
  { date: '2026-09-17', callCount: 2, successfulCalls: 2, failedCalls: 0, successRate: 1 },
];

const AGENT = { id: 'agent_5', name: 'Empfang', language: 'de', status: 'active' };
const CHATBOT = { id: 8, name: 'Support', language: 'de', status: 'active' };

describe('AnalyticsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushLoad(summary: Record<string, unknown> = SUMMARY, daily: unknown[] = DAILY) {
    http.expectOne((req) => req.url === '/api/hub/analytics/summary').flush(summary);
    http.expectOne((req) => req.url === '/api/hub/analytics/daily').flush({ data: daily });
    http.expectOne((req) => req.url === '/api/hub/agents').flush({ data: [AGENT] });
    http.expectOne((req) => req.url === '/api/hub/chatbots').flush({ data: [CHATBOT] });
  }

  async function render(summary: Record<string, unknown> = SUMMARY, daily: unknown[] = DAILY) {
    const fixture = TestBed.createComponent(AnalyticsPage);
    await fixture.whenStable();
    flushLoad(summary, daily);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('asks for the last thirty days by default', async () => {
    const fixture = TestBed.createComponent(AnalyticsPage);
    await fixture.whenStable();

    const daily = http.expectOne((req) => req.url === '/api/hub/analytics/daily');
    expect(daily.request.params.get('days')).toBe('30');
    const summary = http.expectOne((req) => req.url === '/api/hub/analytics/summary');
    expect(summary.request.params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.request.params.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    daily.flush({ data: [] });
    summary.flush({ period: {}, metrics: [] });
    http.expectOne((req) => req.url === '/api/hub/agents').flush({ data: [] });
    http.expectOne((req) => req.url === '/api/hub/chatbots').flush({ data: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  });

  it('shows the consumed units and what they were charged at', async () => {
    const fixture = await render();

    const tiles = fixture.nativeElement.querySelector('[data-testid="analytics-tiles"]');
    expect(tiles.textContent).toContain(USER_TEXTS.analytics.usage.voice_minute);
    expect(tiles.textContent).toContain('128,5');
    expect(tiles.textContent).toContain('25,70');
  });

  it('keeps the platform cost and margin out of the customer view', async () => {
    const fixture = await render();

    const page = fixture.nativeElement.textContent;
    expect(page).not.toContain('9,10');
    expect(page).not.toContain('16,60');
  });

  it('renders one table row and one bar per day', async () => {
    const fixture = await render();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="analytics-daily"] tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('2026-09-16');
    expect(rows[0].textContent).toContain('75');
    expect(rows[0].textContent).toContain('1:35');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="bar-list"] .fill').length).toBe(2);
  });

  it('reports the empty window without any usage', async () => {
    const fixture = await render({ period: {}, metrics: [] }, []);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.analytics.noUsage);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.analytics.noCalls);
  });

  it('reloads the window when another period is picked', async () => {
    const fixture = await render();

    fixture.componentInstance.setDays(7);
    await fixture.whenStable();
    const daily = http.expectOne((req) => req.url === '/api/hub/analytics/daily');
    expect(daily.request.params.get('days')).toBe('7');
    daily.flush({ data: [] });
    http.expectOne((req) => req.url === '/api/hub/analytics/summary').flush({ period: {}, metrics: [] });
    http.expectOne((req) => req.url === '/api/hub/agents').flush({ data: [AGENT] });
    http.expectOne((req) => req.url === '/api/hub/chatbots').flush({ data: [CHATBOT] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(fixture.componentInstance.days()).toBe(7);
  });

  it('asks the agent breakdown for the numeric agent id', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.selectAgent('agent_5');
    http.expectOne('/api/hub/analytics/agents/5').flush({
      stats: { totalCalls: 12, successfulCalls: 9, failedCalls: 3, averageDuration: 61, successRate: 0.75 },
    });
    await pending;
    await fixture.whenStable();

    const facts = fixture.nativeElement.querySelector('[data-testid="analytics-breakdown"]');
    expect(facts.textContent).toContain('12');
    expect(facts.textContent).toContain('1:01');
  });

  it('asks the chatbot breakdown and drops the agent selection', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.selectChatbot(8);
    http.expectOne('/api/hub/analytics/chatbots/8').flush({ stats: { totalCalls: 3 } });
    await pending;
    await fixture.whenStable();

    expect(fixture.componentInstance.agentId()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="analytics-breakdown"]')).not.toBeNull();
  });

  it('explains that a selection has no figures yet', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.selectAgent('agent_5');
    http.expectOne('/api/hub/analytics/agents/5').flush({ stats: null });
    await pending;
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('[data-testid="analytics-breakdown-empty"]').textContent,
    ).toContain(USER_TEXTS.analytics.noActivity);
  });
});
