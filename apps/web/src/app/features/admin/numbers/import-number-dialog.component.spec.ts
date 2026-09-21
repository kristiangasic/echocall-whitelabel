import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n, TEXTS } from '../../../testing/i18n';
import { ImportNumberDialogComponent } from './import-number-dialog.component';

const PATH = '/api/admin/hub/resellers/phone-numbers/import';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ImportNumberDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  beforeEach(async () => {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [ImportNumberDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialogRef,
          useValue: {
            close: (value: unknown) => {
              closed = value;
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(ImportNumberDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('sends the trunk configuration and nothing of the other connection', async () => {
    const fixture = await render();

    fixture.componentInstance.form.patchValue({
      phoneNumber: '+4930111222',
      label: 'Berlin',
      supportsOutbound: false,
      provider: 'sip_trunk',
      address: 'sip.example.com',
      transport: 'tls',
      mediaEncryption: 'required',
      outboundUsername: 'out',
      outboundPassword: 'out-secret',
      allowedAddresses: '198.51.100.1, 198.51.100.2',
    });

    void fixture.componentInstance.submit();
    await settle();
    const request = http.expectOne(PATH);

    expect(request.request.body).toEqual({
      phoneNumber: '+4930111222',
      label: 'Berlin',
      supportsInbound: true,
      supportsOutbound: false,
      provider: 'sip_trunk',
      sipTrunk: {
        outbound: {
          address: 'sip.example.com',
          transport: 'tls',
          mediaEncryption: 'required',
          username: 'out',
          password: 'out-secret',
        },
        inbound: {
          allowedAddresses: ['198.51.100.1', '198.51.100.2'],
          mediaEncryption: 'required',
        },
      },
    });

    request.flush(
      { success: true, phoneNumberId: 'pn_1', localId: 9 },
      { status: 201, statusText: 'Created' },
    );
    await settle();

    expect(closed).toEqual({ phoneNumber: '+4930111222' });
  });

  it('sends the carrier account when that connection is chosen', async () => {
    const fixture = await render();

    fixture.componentInstance.form.patchValue({
      phoneNumber: '+4940333444',
      label: 'Hamburg',
      provider: 'twilio',
      sid: 'AC123',
      token: 'token-secret',
    });

    void fixture.componentInstance.submit();
    await settle();
    const request = http.expectOne(PATH);

    expect(request.request.body).toEqual({
      phoneNumber: '+4940333444',
      label: 'Hamburg',
      supportsInbound: true,
      supportsOutbound: true,
      provider: 'twilio',
      twilio: { sid: 'AC123', token: 'token-secret' },
    });

    request.flush(
      { success: true, phoneNumberId: 'pn_2', localId: 10 },
      { status: 201, statusText: 'Created' },
    );
    await settle();
  });

  it('keeps no credential in the form once the import went through', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.form.patchValue({
      phoneNumber: '+4930111222',
      label: 'Berlin',
      address: 'sip.example.com',
      outboundPassword: 'out-secret',
      inboundPassword: 'in-secret',
    });

    void page.submit();
    await settle();
    http
      .expectOne(PATH)
      .flush({ success: true, phoneNumberId: 'pn_1', localId: 9 }, { status: 201, statusText: 'Created' });
    await settle();

    const value = page.form.getRawValue();
    expect(value.outboundPassword).toBe('');
    expect(value.inboundPassword).toBe('');
  });

  it('keeps what was typed when the hub refuses the import', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.form.patchValue({
      phoneNumber: '+4930111222',
      label: 'Berlin',
      address: 'sip.example.com',
      outboundPassword: 'out-secret',
    });

    void page.submit();
    await settle();
    http
      .expectOne(PATH)
      .flush({ error: { code: 'precondition_failed' } }, { status: 412, statusText: 'Precondition Failed' });
    await settle();

    expect(closed).toBeUndefined();
    expect(page.form.getRawValue().outboundPassword).toBe('out-secret');
    expect(page.busy()).toBe(false);
  });

  it('does not call the hub without a trunk address', async () => {
    const fixture = await render();

    fixture.componentInstance.form.patchValue({ phoneNumber: '+4930111222', label: 'Berlin' });
    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();

    http.expectNone(PATH);
    expect(fixture.componentInstance.form.controls.address.errors).toEqual({ required: true });
    expect(fixture.nativeElement.querySelector('mat-error')?.textContent?.trim()).toBe(
      TEXTS.validation.required,
    );
  });

  it('refuses a number that is not in international notation', async () => {
    const fixture = await render();

    fixture.componentInstance.form.patchValue({
      phoneNumber: '030 111222',
      label: 'Berlin',
      address: 'sip.example.com',
    });
    await fixture.componentInstance.submit();
    await settle();

    http.expectNone(PATH);
    expect(fixture.componentInstance.form.controls.phoneNumber.errors).toEqual({ phoneNumber: true });
  });

  it('says what is missing instead of doing nothing when the form is submitted empty', async () => {
    const fixture = await render();

    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    http.expectNone(PATH);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });

  it('does not call the hub without the carrier credentials', async () => {
    const fixture = await render();

    fixture.componentInstance.form.patchValue({
      phoneNumber: '+4930111222',
      label: 'Berlin',
      provider: 'twilio',
      sid: 'AC123',
    });
    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();

    http.expectNone(PATH);
    expect(fixture.componentInstance.form.controls.token.errors).toEqual({ required: true });
    expect(fixture.nativeElement.querySelector('mat-error')?.textContent?.trim()).toBe(
      TEXTS.validation.required,
    );
  });

  it('demands only the fields of the connection that is chosen', async () => {
    const fixture = await render();
    const form = fixture.componentInstance.form;

    form.patchValue({ phoneNumber: '+4930111222', label: 'Berlin' });
    expect(form.controls.address.errors).toEqual({ required: true });

    form.patchValue({ provider: 'twilio', sid: 'AC123', token: 'tok' });
    expect(form.controls.address.errors).toBeNull();
    expect(form.valid).toBe(true);
  });
});
