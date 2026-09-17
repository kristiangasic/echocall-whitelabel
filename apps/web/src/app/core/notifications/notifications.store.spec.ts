import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationsStore } from './notifications.store';

const NOTIFICATION = {
  id: 4,
  type: 'call.missed',
  title: 'Anruf verpasst',
  message: 'Ein Anrufer hat aufgelegt.',
  isRead: false,
  createdAt: '2026-09-16T10:00:00.000Z',
};

describe('NotificationsStore', () => {
  let http: HttpTestingController;
  let store: NotificationsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(NotificationsStore);
  });

  afterEach(() => http.verify());

  it('asks only for unread entries and keeps their total', async () => {
    const pending = store.refresh();
    const request = http.expectOne((req) => req.url === '/api/hub/notifications');
    expect(request.request.params.get('unreadOnly')).toBe('true');
    request.flush({ data: [NOTIFICATION], pagination: { page: 1, perPage: 5, total: 12 } });
    await pending;

    expect(store.unread()).toBe(12);
    expect(store.preview()).toEqual([NOTIFICATION]);
  });

  it('counts the entries when the hub reports no total', async () => {
    const pending = store.refresh();
    http.expectOne((req) => req.url === '/api/hub/notifications').flush({ data: [NOTIFICATION] });
    await pending;

    expect(store.unread()).toBe(1);
  });

  it('keeps the last count when a poll fails', async () => {
    const first = store.refresh();
    http
      .expectOne((req) => req.url === '/api/hub/notifications')
      .flush({ data: [NOTIFICATION], pagination: { page: 1, perPage: 5, total: 3 } });
    await first;

    const second = store.refresh();
    http
      .expectOne((req) => req.url === '/api/hub/notifications')
      .flush({}, { status: 502, statusText: 'Bad Gateway' });
    await second;

    expect(store.unread()).toBe(3);
  });

  it('marks one entry as read and refreshes', async () => {
    const pending = store.markRead(4);
    const request = http.expectOne('/api/hub/notifications/4/read');
    expect(request.request.method).toBe('PATCH');
    request.flush({ message: 'marked' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications')
      .flush({ data: [], pagination: { page: 1, perPage: 5, total: 0 } });
    await pending;

    expect(store.unread()).toBe(0);
  });

  it('marks everything as read', async () => {
    const pending = store.markAllRead();
    const request = http.expectOne('/api/hub/notifications/read-all');
    expect(request.request.method).toBe('PATCH');
    request.flush({ message: 'marked' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications')
      .flush({ data: [], pagination: { page: 1, perPage: 5, total: 0 } });
    await pending;

    expect(store.unread()).toBe(0);
  });
});
