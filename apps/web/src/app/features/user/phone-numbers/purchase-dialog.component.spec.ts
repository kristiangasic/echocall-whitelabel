import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import type { MarketplaceNumber } from '../../../core/hub/hub.models';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { PurchaseDialogComponent } from './purchase-dialog.component';

const OFFER: MarketplaceNumber = {
  availableDidId: 'did-1',
  skuId: 'sku-1',
  number: '+493044556677',
  countryIso: 'DE',
  areaName: 'Berlin',
  features: ['voice_in'],
  setupPrice: 5,
  monthlyPrice: 3.9,
  numberType: 'local',
  requirementId: 'req-1',
};

describe('PurchaseDialogComponent', () => {
  let http: HttpTestingController;
  let closedWith: unknown;

  beforeEach(async () => {
    closedWith = undefined;
    await TestBed.configureTestingModule({
      imports: [PurchaseDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialogRef,
          useValue: {
            close: (result: unknown) => {
              closedWith = result;
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(PurchaseDialogComponent);
    await fixture.whenStable();
    http.expectOne('/api/hub/phone-numbers/countries').flush({
      data: [{ id: 'c-de', name: 'Germany', iso: 'DE', prefix: '49' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('searches the marketplace for the chosen country', async () => {
    const fixture = await render();
    fixture.componentInstance.countryIso = 'DE';
    fixture.componentInstance.areaCode = '30';

    const pending = fixture.componentInstance.search();
    const request = http.expectOne((req) => req.url === '/api/hub/phone-numbers/search');
    expect(request.request.params.get('countryIso')).toBe('DE');
    expect(request.request.params.get('areaCode')).toBe('30');
    expect(request.request.params.get('numberType')).toBe('local');
    request.flush({ data: [OFFER], count: 1 });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const results = fixture.nativeElement.querySelector('[data-testid="purchase-results"]').textContent;
    expect(results).toContain('+493044556677');
    expect(results).toContain('Berlin');
  });

  it('shows the empty hint when nothing matches', async () => {
    const fixture = await render();
    fixture.componentInstance.countryIso = 'DE';

    const pending = fixture.componentInstance.search();
    http.expectOne((req) => req.url === '/api/hub/phone-numbers/search').flush({ data: [], count: 0 });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.numbers.searchEmpty);
  });

  it('passes the offer back unchanged and closes with the purchase', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.buy(OFFER);
    const request = http.expectOne('/api/hub/phone-numbers/purchase');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      availableDidId: 'did-1',
      skuId: 'sku-1',
      number: '+493044556677',
      countryIso: 'DE',
      areaName: 'Berlin',
      numberType: 'local',
      features: ['voice_in'],
      requirementId: 'req-1',
    });
    request.flush({
      success: true,
      phoneNumberId: 12,
      number: '+493044556677',
      kycRequired: true,
      pricing: { setupPrice: 5, monthlyPrice: 3.9, vat: 1.69, total: 10.59 },
      newBalance: 89.41,
    });
    await pending;

    expect(closedWith).toMatchObject({ phoneNumberId: 12, kycRequired: true });
  });
});
