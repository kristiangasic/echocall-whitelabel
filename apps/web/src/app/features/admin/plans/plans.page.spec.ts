import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type { Plan } from '../../../core/hub/hub.models';
import { ADMIN_TEXTS, provideTestI18n, TEXTS } from '../../../testing/i18n';
import { AdminPlansPage } from './plans.page';

const PLANS: Plan[] = [
  {
    id: 1,
    name: 'Starter',
    description: 'Der Einstieg',
    type: 'voice',
    billingCycle: 'monthly',
    priceEur: '49.00',
    voiceMinutesPerMonth: 500,
    chatConversationsPerMonth: null,
    features: ['Rufnummer inklusive'],
    isActive: true,
    isVisible: true,
  },
  {
    id: 2,
    name: 'Chat Flat',
    description: null,
    type: 'chat',
    billingCycle: 'yearly',
    priceEur: '490.00',
    voiceMinutesPerMonth: null,
    chatConversationsPerMonth: null,
    features: [],
    isActive: false,
    isVisible: false,
  },
];

const PRICING = {
  baseVoiceMinutePrice: 0.3,
  baseChatSessionPrice: 0.4,
  resellerVoiceMinutePrice: 0.45,
  resellerChatSessionPrice: 0.5,
  voiceMinuteMargin: 0.15,
  chatSessionMargin: 0.1,
};

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminPlansPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminPlansPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the plan list, which is all a reload of the table asks for. */
  async function answerPlans(plans: unknown[] = PLANS) {
    http.expectOne('/api/admin/hub/resellers/plans').flush(plans);
    await settle();
  }

  /** Answers the plan list and the two calls the price panel makes on the same page. */
  async function answerLoad(plans: unknown[] = PLANS) {
    await answerPlans(plans);
    http.expectOne('/api/admin/hub/resellers/pricing').flush(PRICING);
    http.expectOne('/api/admin/hub/resellers/pricing/suggestions').flush([]);
    await settle();
  }

  async function render() {
    const fixture = TestBed.createComponent(AdminPlansPage);
    await fixture.whenStable();
    await answerLoad();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('table tbody tr')) as HTMLElement[];

  it('shows every plan with its type, billing cycle, price and allowance', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Starter');
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.plans.types.voice);
    expect(rows[0].textContent).toContain(ADMIN_TEXTS.plans.cycles.monthly);
    expect(rows[0].textContent).toContain('49,00');
    expect(rows[0].textContent).toContain('500');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.plans.cycles.yearly);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.plans.unlimited);
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.plans.inactive);
  });

  it('deletes only after the confirmation was accepted', async () => {
    const fixture = await render();

    fixture.componentInstance.remove(PLANS[0]);
    await settle();
    http.expectNone('/api/admin/hub/resellers/plans/1');

    dialogResult = true;
    fixture.componentInstance.remove(PLANS[0]);
    await settle();
    const deleted = http.expectOne('/api/admin/hub/resellers/plans/1');
    expect(deleted.request.method).toBe('DELETE');
    deleted.flush({ success: true });
    await settle();
    await answerPlans([PLANS[1]]);
  });

  it('keeps the row and repeats the refusal when the plan is still in use', async () => {
    const fixture = await render();
    dialogResult = true;

    fixture.componentInstance.remove(PLANS[0]);
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/plans/1')
      .flush(
        { error: { code: 'plan_in_use', message: 'Cannot delete plan with active subscriptions' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();
    fixture.detectChanges();

    expect(rowsOf(fixture)).toHaveLength(2);
    expect(rowsOf(fixture)[0].textContent).toContain('Starter');
    expect(document.body.textContent).toContain(TEXTS.errors.plan_in_use);
  });

  it('reloads the list after a plan was created', async () => {
    const fixture = await render();
    dialogResult = true;

    fixture.componentInstance.create();
    await settle();
    await answerPlans();
  });

  it('says so instead of showing an empty table', async () => {
    const fixture = TestBed.createComponent(AdminPlansPage);
    await fixture.whenStable();
    await answerLoad([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.plans.empty);
  });
});
