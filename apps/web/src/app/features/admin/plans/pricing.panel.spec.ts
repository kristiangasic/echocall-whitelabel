import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminPricingPanel } from './pricing.panel';

const PRICING = {
  baseVoiceMinutePrice: 0.3,
  baseChatSessionPrice: 0.4,
  resellerVoiceMinutePrice: 0.45,
  resellerChatSessionPrice: 0.5,
  voiceMinuteMargin: 0.15,
  chatSessionMargin: 0.1,
};

/** The four tiers the hub computes; their names arrive in English and are never shown raw. */
const SUGGESTIONS = [
  {
    tier: 'Minimal (Break-even)',
    voiceMinutePrice: 0.3,
    chatSessionPrice: 0.4,
    voiceMargin: 0,
    chatMargin: 0,
    voiceMarginPercent: 0,
    chatMarginPercent: 0,
  },
  {
    tier: 'Standard (25% Margin)',
    voiceMinutePrice: 0.38,
    chatSessionPrice: 0.5,
    voiceMargin: 0.08,
    chatMargin: 0.1,
    voiceMarginPercent: 25,
    chatMarginPercent: 25,
  },
  {
    tier: 'Premium (50% Margin)',
    voiceMinutePrice: 0.45,
    chatSessionPrice: 0.6,
    voiceMargin: 0.15,
    chatMargin: 0.2,
    voiceMarginPercent: 50,
    chatMarginPercent: 50,
  },
  {
    tier: 'Enterprise (100% Margin)',
    voiceMinutePrice: 0.6,
    chatSessionPrice: 0.8,
    voiceMargin: 0.3,
    chatMargin: 0.4,
    voiceMarginPercent: 100,
    chatMarginPercent: 100,
  },
];

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminPricingPanel', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPricingPanel, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(pricing = PRICING) {
    const fixture = TestBed.createComponent(AdminPricingPanel);
    await fixture.whenStable();
    http.expectOne('/api/admin/hub/resellers/pricing').flush(pricing);
    http.expectOne('/api/admin/hub/resellers/pricing/suggestions').flush(SUGGESTIONS);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const input = (fixture: { nativeElement: HTMLElement }, testid: string) =>
    fixture.nativeElement.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement;

  it('shows the platform price, the own price and what is left in between', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(ADMIN_TEXTS.pricing.voiceMinute);
    expect(text).toContain('0,30');
    expect(text).toContain('0,15');
    expect(input(fixture, 'voice-price').value).toBe('0.45');
    expect(input(fixture, 'chat-price').value).toBe('0.5');
  });

  it('names the suggested tiers in the reader language', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(ADMIN_TEXTS.pricing.tiers.minimal);
    expect(text).toContain(ADMIN_TEXTS.pricing.tiers.enterprise);
    expect(text).not.toContain('Break-even');
    expect(text).not.toContain('Margin');
  });

  it('only fills the form when a suggestion is applied and says it is unsaved', async () => {
    const fixture = await render();

    fixture.componentInstance.apply(SUGGESTIONS[3]);
    fixture.detectChanges();

    http.expectNone('/api/admin/hub/resellers/pricing');
    expect(input(fixture, 'voice-price').value).toBe('0.6');
    expect(input(fixture, 'chat-price').value).toBe('0.8');
    expect(fixture.nativeElement.querySelector('[data-testid="unsaved"]')).not.toBeNull();
  });

  it('stores both prices only when saving is asked for', async () => {
    const fixture = await render();
    fixture.componentInstance.apply(SUGGESTIONS[1]);

    void fixture.componentInstance.save();
    await settle();
    const saved = http.expectOne('/api/admin/hub/resellers/pricing');

    expect(saved.request.method).toBe('PATCH');
    expect(saved.request.body).toEqual({ resellerVoiceMinutePrice: 0.38, resellerChatSessionPrice: 0.5 });
    saved.flush({ success: true });
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/pricing')
      .flush({ ...PRICING, resellerVoiceMinutePrice: 0.38, resellerChatSessionPrice: 0.5 });
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="unsaved"]')).toBeNull();
  });

  it('refuses to save a price of zero', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.voice.setValue(0);

    void fixture.componentInstance.save();
    await settle();

    http.expectNone('/api/admin/hub/resellers/pricing');
  });
});
