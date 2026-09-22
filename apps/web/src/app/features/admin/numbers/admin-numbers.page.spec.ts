import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminNumbersPage } from './admin-numbers.page';

const FREE = {
  id: 7,
  phoneNumber: '+4930111222',
  friendlyName: 'Berlin',
  country: 'Germany',
  numberType: 'local',
  monthlyPrice: '3.00',
  status: 'active',
  supportsInbound: true,
  supportsOutbound: false,
  ownerId: null,
};

const TAKEN = {
  phoneNumber: {
    id: 8,
    phoneNumber: '+4940333444',
    friendlyName: 'Hamburg',
    country: 'Germany',
    numberType: 'local',
    monthlyPrice: '3.00',
    status: 'active',
    supportsInbound: true,
    supportsOutbound: true,
    ownerId: 501,
    purchasedAt: '2026-09-01T00:00:00.000Z',
  },
  owner: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminNumbersPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminNumbersPage, provideTestI18n()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answerLoad(free: unknown[] = [FREE], taken: unknown[] = [TAKEN]) {
    http.expectOne('/api/admin/hub/resellers/phone-numbers/available').flush({ data: free });
    http.expectOne('/api/admin/hub/resellers/phone-numbers/assigned').flush({ data: taken });
    await settle();
  }

  async function render(free: unknown[] = [FREE], taken: unknown[] = [TAKEN]) {
    const fixture = TestBed.createComponent(AdminNumbersPage);
    await fixture.whenStable();
    await answerLoad(free, taken);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const tableRows = (fixture: { nativeElement: HTMLElement }, testId: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"] tbody tr`)) as HTMLElement[];

  it('keeps the pool and the handed out numbers apart', async () => {
    const fixture = await render();

    const free = tableRows(fixture, 'available-table');
    expect(free).toHaveLength(1);
    expect(free[0].textContent).toContain('+4930111222');

    const taken = tableRows(fixture, 'assigned-table');
    expect(taken).toHaveLength(1);
    expect(taken[0].textContent).toContain('+4940333444');
    expect(taken[0].textContent).toContain('Lina Mayer');
  });

  it('says what each number can do', async () => {
    const fixture = await render();
    const row = tableRows(fixture, 'available-table')[0];

    expect(row.textContent).toContain(ADMIN_TEXTS.numbers.inbound);
    expect(row.textContent).not.toContain(ADMIN_TEXTS.numbers.outbound);
  });

  it('hands a number to the chosen customer and reads both lists again', async () => {
    const fixture = await render();
    dialogResult = { customerId: 501 };

    fixture.componentInstance.assign(FREE);
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/phone-numbers/7/assign');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ customerId: 501 });
    request.flush({ success: true });
    await settle();

    await answerLoad([], [TAKEN, { ...TAKEN, phoneNumber: { ...FREE, ownerId: 501 } }]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tableRows(fixture, 'available-table')).toHaveLength(0);
    expect(tableRows(fixture, 'assigned-table')).toHaveLength(2);
  });

  it('does not call the hub when no customer was chosen', async () => {
    const fixture = await render();

    fixture.componentInstance.assign(FREE);
    await settle();

    http.expectNone('/api/admin/hub/resellers/phone-numbers/7/assign');
  });

  it('asks before taking a number back from a customer', async () => {
    const fixture = await render();

    fixture.componentInstance.release(TAKEN);
    await settle();
    http.expectNone('/api/admin/hub/resellers/phone-numbers/8/release');

    dialogResult = true;
    fixture.componentInstance.release(TAKEN);
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/phone-numbers/8/release');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('asks before removing a number from the pool for good', async () => {
    const fixture = await render();

    fixture.componentInstance.remove(FREE);
    await settle();
    http.expectNone('/api/admin/hub/resellers/phone-numbers/7');

    dialogResult = true;
    fixture.componentInstance.remove(FREE);
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/phone-numbers/7');
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('reads both lists again after a number was imported', async () => {
    const fixture = await render();
    dialogResult = { phoneNumber: '+4930999888' };

    fixture.componentInstance.importNumber();
    await settle();
    await answerLoad();
  });

  it('says so instead of showing two empty tables', async () => {
    const fixture = await render([], []);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(ADMIN_TEXTS.numbers.empty);
    expect(text).toContain(ADMIN_TEXTS.numbers.emptyAssigned);
  });
});
