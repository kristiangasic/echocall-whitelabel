import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ADMIN_TEXTS, TEXTS, provideTestI18n } from '../../../testing/i18n';
import { SubscriptionDialogComponent } from './subscription-dialog.component';

const CUSTOMERS = [
  { userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
  { userId: 502, user: { id: 502, email: 'timo@example.com', firstName: null, lastName: null } },
];

const PLANS = [
  { id: 1, name: 'Starter', priceEur: '49.00', billingCycle: 'monthly', isActive: true },
  { id: 2, name: 'Alter Tarif', priceEur: '19.00', billingCycle: 'monthly', isActive: false },
];

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SubscriptionDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  async function render(plans: unknown[] = PLANS) {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [SubscriptionDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubscriptionDialogComponent);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    http.expectOne('/api/admin/hub/resellers/plans').flush(plans);
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('posts the customer, the plan and the term the operator picked', async () => {
    const fixture = await render();
    fixture.componentInstance.form.patchValue({ customerId: 501, planId: 1, contractDuration: '6' });

    void fixture.componentInstance.submit();
    await settle();
    const created = http.expectOne('/api/admin/hub/resellers/subscriptions');

    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({ customerId: 501, planId: 1, contractDuration: '6' });
    created.flush({ success: true });
    await settle();
    expect(closed).toBe(true);
  });

  it('offers a term of twelve months unless the operator says otherwise', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.form.controls.contractDuration.value).toBe('12');
    expect(fixture.componentInstance.durations).toEqual(['3', '6', '12']);
  });

  it('refuses to send a subscription without a customer and a plan', async () => {
    const fixture = await render();

    void fixture.componentInstance.submit();
    await settle();

    http.expectNone('/api/admin/hub/resellers/subscriptions');
  });

  it('offers only the plans a customer can still be put on', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.plans().map((plan) => plan.id)).toEqual([1]);
  });

  it('says to create a plan first when none can be sold', async () => {
    const fixture = await render([PLANS[1]]);

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.subscriptions.dialog.noPlans);
  });
  it('says what is missing instead of doing nothing when the form is submitted empty', async () => {
    const fixture = await render();

    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });
});
