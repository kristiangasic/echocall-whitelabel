import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { ConversationDetailPage } from './conversation-detail.page';

describe('ConversationDetailPage', () => {
  let http: HttpTestingController;

  async function setup(id: string, body: Record<string, unknown>) {
    await TestBed.configureTestingModule({
      imports: [ConversationDetailPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ConversationDetailPage);
    await fixture.whenStable();
    http.expectOne(`/api/hub/conversations/${id}`).flush(body);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders the transcript of a chat thread and offers to close it', async () => {
    const fixture = await setup('44', {
      type: 'chat',
      id: 44,
      channel: 'widget',
      status: 'active',
      visitorId: 'v-1',
      visitorName: 'Mara Sole',
      totalMessages: 2,
      isArchived: false,
      startedAt: '2026-09-17T09:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z',
      updatedAt: '2026-09-17T09:00:00.000Z',
      messages: [
        {
          id: 1,
          senderType: 'visitor',
          message: 'Wann habt ihr geoeffnet?',
          createdAt: '2026-09-17T09:00:10.000Z',
        },
        {
          id: 2,
          senderType: 'bot',
          message: 'Taeglich von 9 bis 18 Uhr.',
          createdAt: '2026-09-17T09:00:20.000Z',
        },
      ],
    });

    const transcript = fixture.nativeElement.querySelector('[data-testid="transcript"]').textContent;
    expect(transcript).toContain('Wann habt ihr geoeffnet?');
    expect(transcript).toContain(USER_TEXTS.conversations.senders.visitor);
    expect(fixture.nativeElement.querySelector('[data-testid="close-conversation"]')).not.toBeNull();
  });

  it('shows the plain transcription of a call and no close button', async () => {
    const fixture = await setup('31', {
      type: 'voice',
      id: 31,
      direction: 'outbound',
      fromNumber: '+4930111111',
      toNumber: '+4930222222',
      duration: 65,
      status: 'completed',
      transcription: 'Agent: Guten Tag.',
      createdAt: '2026-09-17T08:00:00.000Z',
    });

    expect(fixture.nativeElement.querySelector('[data-testid="transcript"]').textContent).toContain(
      'Agent: Guten Tag.',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="close-conversation"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.conversations.directions.outbound);
  });

  it('closes a thread and reloads it', async () => {
    const fixture = await setup('44', {
      type: 'chat',
      id: 44,
      channel: 'widget',
      status: 'active',
      visitorId: 'v-1',
      totalMessages: 0,
      isArchived: false,
      startedAt: '2026-09-17T09:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z',
      updatedAt: '2026-09-17T09:00:00.000Z',
      messages: [],
    });

    const pending = fixture.componentInstance.close();
    const request = http.expectOne('/api/hub/conversations/44/close');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { id: 44, status: 'closed' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/conversations/44').flush({
      type: 'chat',
      id: 44,
      channel: 'widget',
      status: 'closed',
      visitorId: 'v-1',
      totalMessages: 0,
      isArchived: false,
      startedAt: '2026-09-17T09:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z',
      updatedAt: '2026-09-17T09:00:00.000Z',
      messages: [],
    });
    await pending;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="close-conversation"]')).toBeNull();
  });
});
