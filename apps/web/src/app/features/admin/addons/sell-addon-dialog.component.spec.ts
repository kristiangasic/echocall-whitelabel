import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ResellerAddonPackage } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ADMIN_TEXTS, TEXTS, provideTestI18n } from '../../../testing/i18n';
import { SellAddonDialogComponent, type SellAddonDialogData } from './sell-addon-dialog.component';

const PACKAGES: ResellerAddonPackage[] = [
  { id: 31, type: 'voice_minutes', name: '500 Minuten', quantity: 500, totalPrice: 79, description: '' },
  { id: 32, type: 'chat_conversations', name: '1000 Chats', quantity: 1000, totalPrice: 49, description: '' },
];

const CUSTOMERS = [
  { id: 4, userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
  { id: 5, userId: 502, user: { id: 502, email: 'timo@example.com', firstName: null, lastName: null } },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SellAddonDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;
  let errors: string[];

  async function setup(data: SellAddonDialogData = {}) {
    closed = undefined;
    errors = [];
    await TestBed.configureTestingModule({
      imports: [SellAddonDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
        {
          provide: NotifyService,
          useValue: {
            error: (key: string) => errors.push(key),
            success: (key: string) => errors.push(key),
            apiError: () => errors.push('apiError'),
            errorKey: (code: string) => `errors.${code}`,
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SellAddonDialogComponent);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/addons/packages').flush({ data: PACKAGES });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('sells the chosen package to the chosen customer', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ customerId: 502, packageId: 32, paymentMethod: 'balance' });

    void fixture.componentInstance.submit();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/addons/sell');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ customerId: 502, packageId: 32, paymentMethod: 'balance' });
    request.flush({ success: true, purchaseId: 9, creditsGranted: 1000 });
    await settle();
    expect(closed).toEqual({ creditsGranted: 1000 });
  });

  it('starts on the package the page handed over', async () => {
    const fixture = await setup({ packageId: 31 });

    expect(fixture.componentInstance.form.getRawValue().packageId).toBe(31);
  });

  it('does not sell anything while customer or package are missing', async () => {
    const fixture = await setup();

    void fixture.componentInstance.submit();
    await settle();
    http.expectNone('/api/admin/hub/resellers/addons/sell');
    expect(closed).toBeUndefined();
  });

  it('says whose balance was too low rather than repeating the customer wording', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ customerId: 501, packageId: 31, paymentMethod: 'balance' });

    void fixture.componentInstance.submit();
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/addons/sell')
      .flush({ error: { code: 'insufficient_balance' } }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(errors).toEqual(['admin.addons.dialog.balanceTooLow']);
    expect(closed).toBeUndefined();
  });

  it('explains that a package needs a running subscription', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ customerId: 501, packageId: 31, paymentMethod: 'manual' });

    void fixture.componentInstance.submit();
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/addons/sell')
      .flush({ error: { code: 'no_subscription' } }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(errors).toEqual(['admin.addons.dialog.noSubscription']);
  });

  it('leaves every other hub problem to the shared message', async () => {
    const fixture = await setup();
    fixture.componentInstance.form.setValue({ customerId: 501, packageId: 31, paymentMethod: 'balance' });

    void fixture.componentInstance.submit();
    await settle();
    http
      .expectOne('/api/admin/hub/resellers/addons/sell')
      .flush({ error: { code: 'upstream_error' } }, { status: 502, statusText: 'Bad Gateway' });
    await settle();

    expect(errors).toEqual(['apiError']);
  });

  it('says so when there is nothing to sell', async () => {
    closed = undefined;
    errors = [];
    await TestBed.configureTestingModule({
      imports: [SellAddonDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SellAddonDialogComponent);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/addons/packages').flush({ data: [] });
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.addons.dialog.noPackages);
  });
  it('says what is missing instead of doing nothing when the form is submitted empty', async () => {
    const fixture = await setup();

    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });
});
