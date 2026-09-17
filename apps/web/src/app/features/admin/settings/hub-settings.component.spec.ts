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
