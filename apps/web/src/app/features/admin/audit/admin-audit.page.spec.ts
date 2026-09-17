import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideTestI18n } from '../../../testing/i18n';
import { AdminAuditPage } from './admin-audit.page';

const LOCAL_ENTRY = {
  id: 3,
  actorEmail: 'operator@example.com',
  action: 'customer.created',
  targetType: 'customer',
  targetId: 12,
  details: { plan: 'starter' },
  ip: '203.0.113.7',
  createdAt: '2026-09-16T09:00:00.000Z',
};

const HUB_ENTRY = {
  id: 9,
  action: 'pricing_updated',
  description: 'Changed the voice minute price',
  targetType: 'user',
  targetId: 412,
  createdAt: '2026-09-16T08:30:00.000Z',
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminAuditPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAuditPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(AdminAuditPage);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/admin/audit')
      .flush({ data: [LOCAL_ENTRY], meta: { page: 1, limit: 50, total: 1 } });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the portal trail and asks the service for nothing yet', async () => {
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('customer.created');
    http.expectNone((req) => req.url === '/api/admin/hub/resellers/activity-log');
  });

  it('loads the service trail when its tab is opened, and only once', async () => {
    const fixture = await render();

    fixture.componentInstance.onTab(1);
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/admin/hub/resellers/activity-log')
      .flush({ data: [HUB_ENTRY], pagination: { page: 1, perPage: 25, total: 1, totalPages: 1 } });
    await settle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Changed the voice minute price');

    fixture.componentInstance.onTab(0);
    fixture.detectChanges();
    fixture.componentInstance.onTab(1);
    await settle();
    fixture.detectChanges();

    http.expectNone((req) => req.url === '/api/admin/hub/resellers/activity-log');
    http.expectNone((req) => req.url === '/api/admin/audit');
  });
});
