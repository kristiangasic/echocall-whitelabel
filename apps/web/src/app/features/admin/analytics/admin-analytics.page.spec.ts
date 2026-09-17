import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminAnalyticsPage } from './admin-analytics.page';

const USAGE = {
  totalChatSessions: 1200,
  totalVoiceMinutes: 480,
  totalRevenue: 950.5,
  totalBaseCost: 610.25,
  totalMargin: 340.25,
  chatSessionRevenue: 600,
  voiceMinuteRevenue: 350.5,
  chatSessionCost: 400,
  voiceMinuteCost: 210.25,
};

const REVENUE = {
  totalRevenue: 950.5,
  platformRevenue: 610.25,
  resellerMargin: 340.25,
  marginPercent: 35.8,
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminAnalyticsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAnalyticsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers both analytics endpoints and hands back the requests they were asked with. */
  async function answerLoad(usage: object = USAGE, revenue: object = REVENUE) {
    const usageRequest = http.expectOne((req) => req.url === '/api/admin/hub/resellers/analytics/usage');
    const revenueRequest = http.expectOne((req) => req.url === '/api/admin/hub/resellers/analytics/revenue');
    usageRequest.flush(usage);
    revenueRequest.flush(revenue);
    await settle();
    return { usage: usageRequest.request, revenue: revenueRequest.request };
  }

  async function render() {
    const fixture = TestBed.createComponent(AdminAnalyticsPage);
    await fixture.whenStable();
    const requests = await answerLoad();
    fixture.detectChanges();
    return { fixture, requests };
  }

  it('shows what was used, what it earned and what it cost', async () => {
    const { fixture } = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(ADMIN_TEXTS.analytics.chatSessions);
    expect(text).toContain('1.200');
    expect(text).toContain('480');
    expect(text).toContain(ADMIN_TEXTS.analytics.margin);
  });

  it('asks both endpoints for the same window', async () => {
    const { requests } = await render();
    const start = requests.usage.params.get('startDate');
    const end = requests.usage.params.get('endDate');

    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(requests.revenue.params.get('startDate')).toBe(start);
    expect(requests.revenue.params.get('endDate')).toBe(end);
  });

  it('takes a new period to both endpoints', async () => {
    const { fixture, requests } = await render();
    const before = requests.usage.params.get('startDate');

    fixture.componentInstance.setDays(7);
    const next = await answerLoad();

    expect(next.usage.params.get('startDate')).not.toBe(before);
    expect(next.revenue.params.get('startDate')).toBe(next.usage.params.get('startDate'));
  });

  it('splits revenue and cost into chat and voice', async () => {
    const { fixture } = await render();
    const lists = fixture.nativeElement.querySelectorAll('[data-testid="bar-list"]');

    expect(lists).toHaveLength(2);
    expect(lists[0].textContent).toContain(ADMIN_TEXTS.analytics.chat);
    expect(lists[0].textContent).toContain(ADMIN_TEXTS.analytics.voice);
    expect(lists[1].textContent).toContain(ADMIN_TEXTS.analytics.voice);
  });

  it('says so when nothing was used in the window', async () => {
    const fixture = TestBed.createComponent(AdminAnalyticsPage);
    await fixture.whenStable();
    await answerLoad(
      {
        totalChatSessions: 0,
        totalVoiceMinutes: 0,
        totalRevenue: 0,
        totalBaseCost: 0,
        totalMargin: 0,
      },
      { totalRevenue: 0, platformRevenue: 0, resellerMargin: 0, marginPercent: 0 },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.analytics.noUsage);
  });
});
