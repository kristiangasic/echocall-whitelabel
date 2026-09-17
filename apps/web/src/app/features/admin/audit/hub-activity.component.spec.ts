import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { HubActivityComponent } from './hub-activity.component';

const ENTRY = {
  id: 9,
  action: 'customer_created',
  description: 'Created customer Muster GmbH',
  targetType: 'user',
  targetId: 412,
  createdAt: '2026-09-16T08:30:00.000Z',
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HubActivityComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubActivityComponent, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(HubActivityComponent);
    await fixture.whenStable();
    const request = http.expectOne((req) => req.url === '/api/admin/hub/resellers/activity-log');
    request.flush({ data: [ENTRY], pagination: { page: 1, perPage: 25, total: 61, totalPages: 3 } });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  it('asks the service for the first page and shows what it recorded', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;

    // The service records an action as a technical key. The operator reads the
    // log in their own language, so the key only shows when we have no wording.
    expect(text).toContain(ADMIN_TEXTS.audit.hub.actions.customer_created);
    expect(text).not.toContain('customer_created');
    expect(text).toContain('Created customer Muster GmbH');
    expect(fixture.componentInstance.total()).toBe(61);
  });

  it('shows an action we have no wording for as the service named it', async () => {
    const fixture = TestBed.createComponent(HubActivityComponent);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/activity-log')
      .flush({
        data: [{ ...ENTRY, action: 'something_the_service_added' }],
        pagination: { page: 1, perPage: 25, total: 1, totalPages: 1 },
      });
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('something_the_service_added');
  });

  it('asks for the next page when the paginator moves', async () => {
    const fixture = await render();

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 25, length: 61, previousPageIndex: 0 });
    await settle();
    const request = http.expectOne((req) => req.url === '/api/admin/hub/resellers/activity-log');

    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('perPage')).toBe('25');

    request.flush({ data: [], pagination: { page: 2, perPage: 25, total: 61, totalPages: 3 } });
    await settle();
  });

  it('says so when the service recorded nothing', async () => {
    const fixture = TestBed.createComponent(HubActivityComponent);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/activity-log')
      .flush({ data: [], pagination: { page: 1, perPage: 25, total: 0, totalPages: 0 } });
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.audit.hub.empty);
  });
});
