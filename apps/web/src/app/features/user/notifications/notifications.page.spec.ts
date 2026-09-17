import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationsStore } from '../../../core/notifications/notifications.store';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { NotificationsPage } from './notifications.page';

const UNREAD = {
  id: 4,
  type: 'call.missed',
  title: 'Anruf verpasst',
  message: 'Ein Anrufer hat aufgelegt.',
  isRead: false,
  createdAt: '2026-09-16T10:00:00.000Z',
};

const READ = { ...UNREAD, id: 5, title: 'Guthaben gebucht', isRead: true };

describe('NotificationsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(items: Record<string, unknown>[] = [UNREAD, READ]) {
    const fixture = TestBed.createComponent(NotificationsPage);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/hub/notifications')
      .flush({ data: items, pagination: { page: 1, perPage: 25, total: items.length } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists what the hub reported', async () => {
    const fixture = await render();

    const list = fixture.nativeElement.querySelector('[data-testid="notifications-list"]');
    expect(list.textContent).toContain('Anruf verpasst');
    expect(list.textContent).toContain('Guthaben gebucht');
  });

  it('offers the read button only for unread entries', async () => {
    const fixture = await render();

    expect(fixture.nativeElement.querySelector('[data-testid="notification-read-4"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="notification-read-5"]')).toBeNull();
  });

  it('shows the empty hint without notifications', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.notifications.empty);
  });

  it('marks one entry as read and refreshes the bell', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.markRead(UNREAD);
    const request = http.expectOne('/api/hub/notifications/4/read');
    expect(request.request.method).toBe('PATCH');
    request.flush({ message: 'marked' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications' && req.params.get('unreadOnly') === 'true')
      .flush({ data: [], pagination: { page: 1, perPage: 5, total: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications' && !req.params.has('unreadOnly'))
      .flush({ data: [{ ...UNREAD, isRead: true }, READ] });
    await pending;

    expect(TestBed.inject(NotificationsStore).unread()).toBe(0);
  });

  it('marks everything as read at once', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.markAll();
    const request = http.expectOne('/api/hub/notifications/read-all');
    expect(request.request.method).toBe('PATCH');
    request.flush({ message: 'marked' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications' && req.params.get('unreadOnly') === 'true')
      .flush({ data: [], pagination: { page: 1, perPage: 5, total: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/notifications' && !req.params.has('unreadOnly'))
      .flush({ data: [] });
    await pending;

    expect(fixture.componentInstance.notifications()).toEqual([]);
  });
});
