import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { ConversationsPage } from './conversations.page';

describe('ConversationsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConversationsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(data: Record<string, unknown>[], total = data.length) {
    const fixture = TestBed.createComponent(ConversationsPage);
    await fixture.whenStable();
    const request = http.expectOne((req) => req.url === '/api/hub/conversations');
    expect(request.request.params.get('type')).toBe('voice');
    expect(request.request.params.get('page')).toBe('1');
    request.flush({ data, pagination: { page: 1, perPage: 25, total } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists calls with the number of the other side', async () => {
    const fixture = await render([
      {
        type: 'voice',
        id: 31,
        direction: 'inbound',
        fromNumber: '+4930111111',
        toNumber: '+4930222222',
        duration: 95,
        status: 'completed',
        createdAt: '2026-09-17T08:00:00.000Z',
      },
    ]);

    const row = fixture.nativeElement.querySelector('table tbody tr');
    expect(row.textContent).toContain('+4930111111');
    expect(row.textContent).toContain('1:35');
    expect(row.textContent).toContain(USER_TEXTS.conversations.statuses.completed);
  });

  it('switches to chat threads and names the visitor', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.conversations.empty);

    fixture.componentInstance.setType('chat');
    const request = http.expectOne((req) => req.url === '/api/hub/conversations');
    expect(request.request.params.get('type')).toBe('chat');
    request.flush({
      data: [
        {
          type: 'chat',
          id: 44,
          channel: 'widget',
          status: 'active',
          visitorId: 'v-1',
          visitorName: 'Mara Sole',
          totalMessages: 3,
          startedAt: '2026-09-17T09:00:00.000Z',
          createdAt: '2026-09-17T09:00:00.000Z',
          updatedAt: '2026-09-17T09:00:00.000Z',
          isArchived: false,
        },
      ],
      pagination: { page: 1, perPage: 25, total: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const row = fixture.nativeElement.querySelector('table tbody tr');
    expect(row.textContent).toContain('Mara Sole');
    expect(row.textContent).toContain(USER_TEXTS.conversations.statuses.active);
  });
});
