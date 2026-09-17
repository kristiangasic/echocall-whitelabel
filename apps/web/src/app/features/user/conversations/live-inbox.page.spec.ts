import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { LiveInboxPage } from './live-inbox.page';

const THREAD = {
  type: 'chat',
  id: 44,
  channel: 'widget',
  status: 'active',
  visitorId: 'v-1',
  visitorName: 'Mara Sole',
  totalMessages: 1,
  isArchived: false,
  startedAt: '2026-09-17T09:00:00.000Z',
  createdAt: '2026-09-17T09:00:00.000Z',
  updatedAt: '2026-09-17T09:00:00.000Z',
};

const CLOSED_THREAD = { ...THREAD, id: 45, status: 'closed', visitorName: 'Old Thread' };

describe('LiveInboxPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveInboxPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(threads: Record<string, unknown>[] = [THREAD, CLOSED_THREAD]) {
    const fixture = TestBed.createComponent(LiveInboxPage);
    await fixture.whenStable();
    http
      .expectOne((req) => req.url === '/api/hub/conversations')
      .flush({ data: threads, pagination: { page: 1, perPage: 50 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists open threads only', async () => {
    const fixture = await render();
    const list = fixture.nativeElement.querySelector('[data-testid="inbox-threads"]').textContent;
    expect(list).toContain('Mara Sole');
    expect(list).not.toContain('Old Thread');
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.inbox.selectHint);
  });

  it('sends a reply and reloads the thread', async () => {
    const fixture = await render();
    fixture.componentInstance.selectedId.set(44);
    fixture.componentInstance.reply = 'Wir melden uns gleich.';

    const pending = fixture.componentInstance.send();
    const request = http.expectOne('/api/hub/conversations/44/messages');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ message: 'Wir melden uns gleich.' });
    request.flush({ data: { id: 5 } }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne((req) => req.url === '/api/hub/conversations/44/messages').flush({
      data: [
        {
          id: 5,
          conversationId: 44,
          senderType: 'agent',
          message: 'Wir melden uns gleich.',
          isRead: true,
          createdAt: '2026-09-17T09:05:00.000Z',
        },
      ],
    });
    await pending;
    await fixture.whenStable();

    expect(fixture.componentInstance.reply).toBe('');
    expect(fixture.nativeElement.querySelector('[data-testid="inbox-messages"]').textContent).toContain(
      'Wir melden uns gleich.',
    );
  });

  it('stops polling once the page is destroyed', async () => {
    const fixture = await render();
    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 60));
    http.verify();
  });
});
