import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { HubSettingsComponent } from './hub-settings.component';

const COMPANY = {
  companyName: 'Muster Telekom',
  companyLegalName: 'Muster Telekom GmbH',
  companyAddress: 'Hauptstrasse 1, 10115 Berlin',
  companyVatId: 'DE123456789',
  brandLogo: 'https://cdn.example.com/logo.png',
  brandPrimaryColor: '#123456',
  companyLogo: null,
};

/** The company as it looks once the invoice details are filled in. */
const INVOICE_COMPANY = {
  ...COMPANY,
  companyPostalCode: '10115',
  companyCity: 'Berlin',
  companyCountry: 'DE',
  companyTaxNumber: '',
  companyBankName: 'Musterbank',
  companyIban: 'DE02120300000000202051',
  companyBic: 'BYLADEM1001',
  companyPaymentTermsDays: 30,
  companyInvoiceFooter: 'Vielen Dank fuer Ihren Auftrag.',
  missingCompanyFields: [],
};

const SETTINGS = {
  companyName: 'Muster Telekom',
  companyAddress: 'Hauptstrasse 1, 10115 Berlin',
  companyEmail: 'rechnung@example.com',
  companyPhone: '+49 30 1234567',
  companyVatId: 'DE123456789',
  stripeConfigured: true,
  paypalConfigured: false,
  stripePublishableKey: 'pk_live_visible',
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HubSettingsComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubSettingsComponent, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answerLoad(company: object = COMPANY, settings: object = SETTINGS) {
    http.expectOne('/api/admin/hub/resellers/company').flush(company);
    http.expectOne('/api/admin/hub/resellers/settings').flush(settings);
    await settle();
  }

  async function render(company: object = COMPANY, settings: object = SETTINGS) {
    const fixture = TestBed.createComponent(HubSettingsComponent);
    await fixture.whenStable();
    await answerLoad(company, settings);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the company the service has on file', async () => {
    const fixture = await render();
    const form = fixture.componentInstance.companyForm.getRawValue();

    expect(form.companyName).toBe('Muster Telekom');
    expect(form.companyLegalName).toBe('Muster Telekom GmbH');
    expect(form.companyVatId).toBe('DE123456789');
    expect(fixture.componentInstance.logoForm.getRawValue().logoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('sends only the company fields that changed', async () => {
    const fixture = await render();

    fixture.componentInstance.companyForm.controls.companyAddress.setValue('Nebenweg 2, 10115 Berlin');
    void fixture.componentInstance.saveCompany();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/company');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ companyAddress: 'Nebenweg 2, 10115 Berlin' });

    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('sends nothing when no company field changed', async () => {
    const fixture = await render();

    await fixture.componentInstance.saveCompany();
    await settle();

    http.expectNone('/api/admin/hub/resellers/company');
  });

  it('never renders a stored secret and sends only the filled keys', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>,
    ).map((input) => input.value);

    expect(text).toContain(ADMIN_TEXTS.settings.hub.stored);
    expect(values).not.toContain('pk_live_visible');
    expect(fixture.componentInstance.keysForm.getRawValue().stripeSecretKey).toBe('');

    fixture.componentInstance.keysForm.controls.stripeSecretKey.setValue('sk_live_new');
    void fixture.componentInstance.saveKeys();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/settings/payment-keys');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ stripeSecretKey: 'sk_live_new' });

    request.flush({ success: true });
    await settle();
    await answerLoad();
    expect(fixture.componentInstance.keysForm.getRawValue().stripeSecretKey).toBe('');
  });

  it('writes the logo where the service keeps it', async () => {
    const fixture = await render();

    fixture.componentInstance.logoForm.controls.logoUrl.setValue('https://cdn.example.com/new.png');
    void fixture.componentInstance.saveLogo();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/settings/logo');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ logoUrl: 'https://cdn.example.com/new.png' });

    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('shows the invoice details the service has on file', async () => {
    const fixture = await render(INVOICE_COMPANY);
    const form = fixture.componentInstance.companyForm.getRawValue();

    expect(form.companyPostalCode).toBe('10115');
    expect(form.companyCity).toBe('Berlin');
    expect(form.companyBankName).toBe('Musterbank');
    expect(form.companyPaymentTermsDays).toBe(30);
    expect(form.companyInvoiceFooter).toBe('Vielen Dank fuer Ihren Auftrag.');
    expect(fixture.nativeElement.querySelector('[data-testid="company-incomplete"]')).toBeNull();
  });

  // The operator should read this here, not from a refused invoice.
  it('says which details are still missing before an invoice is written', async () => {
    const fixture = await render({
      ...INVOICE_COMPANY,
      companyCity: '',
      missingCompanyFields: ['companyCity', 'companyVatId'],
    });

    const warning = fixture.nativeElement.querySelector('[data-testid="company-incomplete"]') as HTMLElement;
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain(ADMIN_TEXTS.settings.hub.city);
    expect(warning.textContent).toContain(ADMIN_TEXTS.settings.hub.vatId);
  });

  it('stores an IBAN the way the service keeps it, however it was typed', async () => {
    const fixture = await render(INVOICE_COMPANY);

    fixture.componentInstance.companyForm.controls.companyIban.setValue('de44 5001 0517 5407 3249 31');
    void fixture.componentInstance.saveCompany();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/company');

    expect(request.request.body).toEqual({ companyIban: 'DE44500105175407324931' });

    request.flush({ success: true });
    await settle();
    await answerLoad(INVOICE_COMPANY);
  });

  it('treats the same IBAN written with spaces as unchanged', async () => {
    const fixture = await render(INVOICE_COMPANY);

    fixture.componentInstance.companyForm.controls.companyIban.setValue('DE02 1203 0000 0000 2020 51');
    await fixture.componentInstance.saveCompany();
    await settle();

    http.expectNone('/api/admin/hub/resellers/company');
  });

  it('sends a changed payment term as a number', async () => {
    const fixture = await render(INVOICE_COMPANY);

    fixture.componentInstance.companyForm.controls.companyPaymentTermsDays.setValue(7);
    void fixture.componentInstance.saveCompany();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/company');

    expect(request.request.body).toEqual({ companyPaymentTermsDays: 7 });

    request.flush({ success: true });
    await settle();
    await answerLoad(INVOICE_COMPANY);
  });

  it('removes the logo by sending nothing rather than an empty string', async () => {
    const fixture = await render();

    fixture.componentInstance.logoForm.controls.logoUrl.setValue('');
    void fixture.componentInstance.saveLogo();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/settings/logo');

    expect(request.request.body).toEqual({ logoUrl: null });

    request.flush({ success: true });
    await settle();
    await answerLoad();
  });
});
