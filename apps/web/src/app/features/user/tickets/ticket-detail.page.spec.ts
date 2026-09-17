import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { TicketDetailPage } from './ticket-detail.page';

const MESSAGES = [
  {
    id: 1,
    message: 'Seit gestern kommt kein Anruf an.',
    createdAt: '2026-09-16T10:00:00.000Z',
    sender: { name: null, role: 'user' },
  },
  {
    id: 2,
    message: 'Wir pruefen die Weiterleitung.',
    createdAt: '2026-09-16T11:00:00.000Z',
    sender: { name: 'Team', role: 'admin' },
  },
];

function ticket(status: string) {
  return {
    id: 'ticket_5',
    subject: 'Rufnummer klingelt nicht',
    description: 'Die Rufnummer nimmt keine Anrufe an.',
    status,
    category: 'technical',
    priority: 'high',
    createdAt: '2026-09-16T09:00:00.000Z',
    messages: MESSAGES,
  };
}

describe('TicketDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketDetailPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'ticket_5' }) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(status = 'open') {
    const fixture = TestBed.createComponent(TicketDetailPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/tickets/ticket_5').flush(ticket(status));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('shows the request with its thread', async () => {
    const fixture = await render();

    expect(fixture.nativeElement.querySelector('[data-testid="ticket-status"]').textContent).toContain(
      USER_TEXTS.tickets.statuses.open,
    );
    const thread = fixture.nativeElement.querySelector('[data-testid="ticket-thread"]');
    expect(thread.textContent).toContain('Seit gestern kommt kein Anruf an.');
    expect(thread.textContent).toContain('Wir pruefen die Weiterleitung.');
  });

  it('marks the operator answers apart from the customer messages', async () => {
    const fixture = await render();

    const messages = fixture.nativeElement.querySelectorAll('[data-testid="ticket-thread"] .message');
    expect(messages[0].classList.contains('support')).toBe(false);
    expect(messages[1].classList.contains('support')).toBe(true);
  });

  it('names each writer by their side of the thread, not by the name the hub carries', async () => {
    const fixture = await render();

    const senders = [...fixture.nativeElement.querySelectorAll('[data-testid="ticket-thread"] .sender')].map(
      (element: HTMLElement) => element.textContent?.trim(),
    );
    expect(senders).toEqual([USER_TEXTS.tickets.you, USER_TEXTS.tickets.support]);
    expect(fixture.nativeElement.textContent).not.toContain('Team');
  });

  it('sends a reply and reloads the thread', async () => {
    const fixture = await render();
    fixture.componentInstance.reply.set('Danke, ich warte.');

    const pending = fixture.componentInstance.send();
    const request = http.expectOne('/api/hub/tickets/ticket_5/messages');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ message: 'Danke, ich warte.' });
    request.flush({ message: 'created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/tickets/ticket_5').flush(ticket('open'));
    await pending;

    expect(fixture.componentInstance.reply()).toBe('');
  });

  it('hides the reply box of a closed request', async () => {
    const fixture = await render('closed');

    expect(fixture.nativeElement.querySelector('[data-testid="ticket-reply"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="ticket-closed"]').textContent).toContain(
      USER_TEXTS.tickets.closedHint,
    );
  });

  it('refuses to send an empty reply', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.canSend()).toBe(false);
    await fixture.componentInstance.send();
  });
});
