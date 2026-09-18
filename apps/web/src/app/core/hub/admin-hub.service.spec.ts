import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminHubService } from './admin-hub.service';
import { HubService } from './hub.service';

describe('AdminHubService', () => {
  let http: HttpTestingController;
  let hub: AdminHubService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    hub = TestBed.inject(AdminHubService);
  });

  afterEach(() => http.verify());

  it('calls the operator proxy, not the customer one', () => {
    let seen: unknown;
    hub.page('/resellers/customers', { page: 2, perPage: 25 }).subscribe((res) => (seen = res));

    const req = http.expectOne((r) => r.url === '/api/admin/hub/resellers/customers');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('perPage')).toBe('25');
    req.flush({ data: [{ id: 1 }], pagination: { page: 2, perPage: 25, total: 1 } });

    expect(seen).toEqual({ data: [{ id: 1 }], pagination: { page: 2, perPage: 25, total: 1 } });
  });

  it('reads a collection the service answers as a bare array', () => {
    let seen: unknown;
    hub.page('/resellers/customers', { page: 1, perPage: 25 }).subscribe((res) => (seen = res));

    // Older releases of the service answer some collections without the envelope.
    http.expectOne((r) => r.url === '/api/admin/hub/resellers/customers').flush([{ id: 1 }, { id: 2 }]);

    expect(seen).toEqual({ data: [{ id: 1 }, { id: 2 }] });
  });

  it('reads a bare array for list() as well', () => {
    let seen: unknown[] = [];
    hub.list<{ id: number }>('/resellers/plans').subscribe((res) => (seen = res));

    http.expectOne('/api/admin/hub/resellers/plans').flush([{ id: 4 }]);

    expect(seen).toEqual([{ id: 4 }]);
  });

  it('answers with an empty collection when the service sends neither shape', () => {
    let page: unknown;
    let items: unknown[] = [];
    hub.page('/resellers/tickets').subscribe((res) => (page = res));
    http.expectOne('/api/admin/hub/resellers/tickets').flush(null);
    hub.list('/resellers/tickets').subscribe((res) => (items = res));
    http.expectOne('/api/admin/hub/resellers/tickets').flush(null);

    expect(page).toEqual({ data: [] });
    expect(items).toEqual([]);
  });

  it('unwraps a { data } envelope for list()', () => {
    let seen: unknown[] = [];
    hub.list<{ id: number }>('/resellers/plans').subscribe((res) => (seen = res));

    http.expectOne('/api/admin/hub/resellers/plans').flush({ data: [{ id: 4 }] });

    expect(seen).toEqual([{ id: 4 }]);
  });

  it('sends writes to the operator proxy', () => {
    hub.post('/resellers/customers', { email: 'new@example.com' }).subscribe();
    const created = http.expectOne('/api/admin/hub/resellers/customers');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({ email: 'new@example.com' });
    created.flush({ data: { id: 9 } });

    hub.patch('/resellers/customers/9', { name: 'Renamed' }).subscribe();
    http.expectOne('/api/admin/hub/resellers/customers/9').flush({ data: { id: 9 } });

    hub.delete('/resellers/customers/9').subscribe();
    const removed = http.expectOne('/api/admin/hub/resellers/customers/9');
    expect(removed.request.method).toBe('DELETE');
    removed.flush({ success: true });
  });

  it('leaves the customer client on its own prefix', () => {
    TestBed.inject(HubService).get('/agents').subscribe();

    http.expectOne('/api/hub/agents').flush({ data: [] });
  });
});
