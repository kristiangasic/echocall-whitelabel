import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { PhoneNumbersPage } from './phone-numbers.page';

const NUMBER = {
  id: 12,
  phoneNumber: '+493012345678',
  friendlyName: 'Zentrale',
  numberType: 'local',
  voiceAgentId: null,
  monthlyPrice: '3.90',
  status: 'active',
  kycStatus: 'pending',
};

const AGENT = { id: 'agent_5', name: 'Empfang', language: 'de', status: 'active' };

describe('PhoneNumbersPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [PhoneNumbersPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(numbers: Record<string, unknown>[] = [NUMBER]) {
    const fixture = TestBed.createComponent(PhoneNumbersPage);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/hub/phone-numbers').flush({ data: numbers });
    http.expectOne('/api/hub/agents').flush({ data: [AGENT] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the numbers with their type and verification state', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('table tbody tr');
    expect(row.textContent).toContain('+493012345678');
    expect(row.textContent).toContain(USER_TEXTS.numbers.types.local);
    expect(row.textContent).toContain(USER_TEXTS.numbers.kycStatuses.pending);
  });

  it('shows the empty hint without numbers', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.numbers.empty);
  });

  it('assigns an agent by its numeric id', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.assign(fixture.componentInstance.numbers()[0], 5);
    const request = http.expectOne('/api/hub/phone-numbers/12');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ voiceAgentId: 5 });
    request.flush({ message: 'ok' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne((req) => req.url === '/api/hub/phone-numbers').flush({ data: [NUMBER] });
    http.expectOne('/api/hub/agents').flush({ data: [AGENT] });
    await pending;
  });

  it('sends null to take a number off its agent', async () => {
    const fixture = await render([{ ...NUMBER, voiceAgentId: 5 }]);

    const pending = fixture.componentInstance.assign(fixture.componentInstance.numbers()[0], null);
    const request = http.expectOne('/api/hub/phone-numbers/12');
    expect(request.request.body).toEqual({ voiceAgentId: null });
    request.flush({ message: 'ok' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne((req) => req.url === '/api/hub/phone-numbers').flush({ data: [NUMBER] });
    http.expectOne('/api/hub/agents').flush({ data: [AGENT] });
    await pending;
  });

  it('does not call the service when the label is unchanged', async () => {
    const fixture = await render();

    await fixture.componentInstance.saveLabel(fixture.componentInstance.numbers()[0], 'Zentrale');
    http.verify();
  });

  it('cancels a number once the confirmation was accepted', async () => {
    dialogResult = true;
    const fixture = await render();

    const pending = fixture.componentInstance.cancel(fixture.componentInstance.numbers()[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/phone-numbers/12');
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true, cancelationEndDate: '2026-10-17T00:00:00.000Z' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne((req) => req.url === '/api/hub/phone-numbers').flush({ data: [] });
    http.expectOne('/api/hub/agents').flush({ data: [AGENT] });
    await pending;
  });

  it('keeps the number when the confirmation was dismissed', async () => {
    dialogResult = false;
    const fixture = await render();

    await fixture.componentInstance.cancel(fixture.componentInstance.numbers()[0]);
    http.verify();
  });
});
