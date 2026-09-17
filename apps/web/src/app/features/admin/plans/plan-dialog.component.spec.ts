import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Plan } from '../../../core/hub/hub.models';
import { provideTestI18n } from '../../../testing/i18n';
import { PlanDialogComponent, type PlanDialogData } from './plan-dialog.component';

const PLAN = {
  id: 7,
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
} as Plan;

/** Lets the component's own promises run before the next expectation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PlanDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  async function render(data: PlanDialogData) {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [PlanDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlanDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('posts the typed body when a plan is created', async () => {
    const fixture = await render({ mode: 'create' });
    fixture.componentInstance.form.patchValue({
      name: 'Chat Flat',
      description: 'Alles im Chat',
      type: 'chat',
      billingCycle: 'yearly',
      priceEur: 490,
      chatConversations: '2000',
      features: 'Eigene Rufnummer\nPersönlicher Kontakt',
    });

    void fixture.componentInstance.submit();
    await settle();
    const created = http.expectOne('/api/admin/hub/resellers/plans');

    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({
      name: 'Chat Flat',
      description: 'Alles im Chat',
      type: 'chat',
      billingCycle: 'yearly',
      priceEur: 490,
      chatConversationsPerMonth: 2000,
      features: ['Eigene Rufnummer', 'Persönlicher Kontakt'],
    });
    created.flush({ id: 9, success: true });
    await settle();
    expect(closed).toBe(true);
  });

  it('leaves an empty allowance out, so the plan stays unmetered', async () => {
    const fixture = await render({ mode: 'create' });
    fixture.componentInstance.form.patchValue({ name: 'Voice Flat', type: 'voice', priceEur: 99 });

    void fixture.componentInstance.submit();
    await settle();
    const created = http.expectOne('/api/admin/hub/resellers/plans');

    expect(created.request.body).toEqual({
      name: 'Voice Flat',
      type: 'voice',
      billingCycle: 'monthly',
      priceEur: 99,
    });
    created.flush({ id: 10, success: true });
    await settle();
  });

  it('refuses to send a plan without a name or a price', async () => {
    const fixture = await render({ mode: 'create' });

    void fixture.componentInstance.submit();
    await settle();

    http.expectNone('/api/admin/hub/resellers/plans');
  });

  it('sends only what an existing plan still lets you change', async () => {
    const fixture = await render({ mode: 'edit', plan: PLAN });
    expect(fixture.componentInstance.form.controls.type.disabled).toBe(true);
    expect(fixture.componentInstance.form.controls.billingCycle.disabled).toBe(true);
    expect(fixture.componentInstance.form.controls.voiceMinutes.disabled).toBe(true);

    fixture.componentInstance.form.patchValue({ name: 'Starter Plus', priceEur: 59, isVisible: false });
    void fixture.componentInstance.submit();
    await settle();
    const saved = http.expectOne('/api/admin/hub/resellers/plans/7');

    expect(saved.request.method).toBe('PATCH');
    expect(saved.request.body).toEqual({
      name: 'Starter Plus',
      description: 'Der Einstieg',
      priceEur: 59,
      features: ['Rufnummer inklusive'],
      isActive: true,
      isVisible: false,
    });
    saved.flush({ success: true });
    await settle();
    expect(closed).toBe(true);
  });
});
