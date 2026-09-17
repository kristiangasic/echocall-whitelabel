import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminTicketDetailPage } from './admin-ticket-detail.page';

const DETAIL = {
  ticket: {
    id: 31,
    userId: 501,
    resellerId: 7,
    subject: 'Anruf bricht ab',
    description: 'Der Anruf endet nach zehn Sekunden.',
    category: 'technical',
    priority: 'high',
    status: 'open',
    assignedToAdmin: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
  },
  customer: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  messages: [
    {
      id: 1,
      message: 'Es passiert bei jedem Anruf.',
      isInternal: false,
      createdAt: '2026-09-15T08:05:00.000Z',
      attachments: [],
      sender: { id: 501, name: 'Lina Mayer', role: 'user' },
    },
    {
      id: 2,
      message: 'Trunk pruefen.',
      isInternal: true,
      createdAt: '2026-09-15T08:30:00.000Z',
      attachments: [],
      sender: { id: 9, name: 'Team', role: 'reseller' },
    },
  ],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminTicketDetailPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [AdminTicketDetailPage, provideTestI18n()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '31' }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answerLoad(body: object = DETAIL, status = 200) {
    const request = http.expectOne('/api/admin/hub/resellers/tickets/31');
    if (status === 200) request.flush(body);
    else request.flush(body, { status, statusText: 'Not Found' });
    await settle();
  }

  async function render(body: object = DETAIL, status = 200) {
    const fixture = TestBed.createComponent(AdminTicketDetailPage);
    await fixture.whenStable();
    await answerLoad(body, status);
    fixture.detectChanges();
    return fixture;
  }

  const messagesOf = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-testid="message"]')) as HTMLElement[];

  it('names the ticket, its customer and its state', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Anruf bricht ab');
    expect(text).toContain('Lina Mayer');
    expect(text).toContain(ADMIN_TEXTS.tickets.statuses.open);
    expect(text).toContain(ADMIN_TEXTS.tickets.priorities.high);
    expect(text).toContain('Der Anruf endet nach zehn Sekunden.');
  });

  it('shows the conversation and marks the internal note as one', async () => {
    const fixture = await render();
    const messages = messagesOf(fixture);

    expect(messages).toHaveLength(2);
    expect(messages[0].textContent).toContain('Es passiert bei jedem Anruf.');
    expect(messages[0].textContent).not.toContain(ADMIN_TEXTS.tickets.detail.internalBadge);
    expect(messages[1].textContent).toContain(ADMIN_TEXTS.tickets.detail.internalBadge);
  });

  it('puts a reply in the thread after posting it', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.reply.set('Wir schauen uns das an.');
    void page.send();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/tickets/31/reply');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ message: 'Wir schauen uns das an.', isInternal: false });

    request.flush({ success: true, messageId: 3 });
    await settle();
    await answerLoad({
      ...DETAIL,
      messages: [
        ...DETAIL.messages,
        {
          id: 3,
          message: 'Wir schauen uns das an.',
          isInternal: false,
          createdAt: '2026-09-15T10:00:00.000Z',
          attachments: [],
          sender: { id: 9, name: 'Team', role: 'reseller' },
        },
      ],
    });
    fixture.detectChanges();

    expect(messagesOf(fixture)).toHaveLength(3);
    expect(page.reply()).toBe('');
  });

  it('sends an internal note as internal', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.reply.set('Trunk beim Anbieter pruefen.');
    page.internal.set(true);
    void page.send();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/tickets/31/reply');

    expect(request.request.body).toEqual({ message: 'Trunk beim Anbieter pruefen.', isInternal: true });

    request.flush({ success: true, messageId: 4 });
    await settle();
    await answerLoad();
  });

  it('sends nothing when the reply is empty', async () => {
    const fixture = await render();

    fixture.componentInstance.reply.set('   ');
    await fixture.componentInstance.send();
    await settle();

    http.expectNone('/api/admin/hub/resellers/tickets/31/reply');
  });

  it('changes nothing but the status', async () => {
    const fixture = await render();

    void fixture.componentInstance.setStatus('in_progress');
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/tickets/31');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'in_progress' });

    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('asks before handing the ticket to platform support', async () => {
    const fixture = await render();

    fixture.componentInstance.escalate();
    await settle();
    http.expectNone('/api/admin/hub/resellers/tickets/31/escalate');

    dialogResult = true;
    fixture.componentInstance.escalate();
    await settle();
    const request = http.expectOne('/api/admin/hub/resellers/tickets/31/escalate');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true });
    await settle();
    await answerLoad();
  });

  it('says where a ticket sits once it was handed over', async () => {
    const fixture = await render({ ...DETAIL, ticket: { ...DETAIL.ticket, assignedToAdmin: 1 } });

    expect(fixture.nativeElement.textContent).toContain(ADMIN_TEXTS.tickets.detail.escalatedHint);
  });

  it('says so when the ticket is not there', async () => {
    const fixture = await render({ error: { code: 'not_found' } }, 404);

    expect(fixture.nativeElement.querySelector('[data-testid="missing"]')?.textContent).toContain(
      ADMIN_TEXTS.tickets.detail.missing,
    );
  });
});
