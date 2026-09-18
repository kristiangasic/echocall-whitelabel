import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NotifyService } from '../../../core/notify/notify.service';
import { ADMIN_TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AdminAgentsPage } from './admin-agents.page';

@Component({ template: '' })
class BlankPage {}

const AGENTS = [
  {
    agent: {
      id: 12,
      name: 'Empfang',
      language: 'en',
      userId: 501,
      createdAt: '2026-09-01T08:00:00.000Z',
    },
    owner: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  },
  {
    agent: { id: 13, name: 'Nachtdienst', language: 'en', userId: 777, createdAt: null },
    owner: null,
  },
];

const CHATBOTS = [
  {
    chatbot: {
      id: 4,
      name: 'Webchat',
      language: 'en',
      userId: 501,
      createdAt: '2026-09-02T08:00:00.000Z',
    },
    owner: { id: 501, email: 'lina@example.com', name: 'Lina Mayer' },
  },
];

const CUSTOMER_SESSION = {
  id: 9,
  email: 'lina@example.com',
  role: 'user',
  echocallCustomerId: 501,
  impersonator: { id: 1, email: 'admin@example.com' },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminAgentsPage', () => {
  let http: HttpTestingController;
  let errors: unknown[];

  beforeEach(async () => {
    errors = [];
    await TestBed.configureTestingModule({
      imports: [AdminAgentsPage, provideTestI18n()],
      providers: [
        provideRouter([{ path: 'app', component: BlankPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NotifyService,
          useValue: { apiError: (err: unknown) => errors.push(err), success: () => undefined },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answerLoad(agents: unknown[] = AGENTS, chatbots: unknown[] = CHATBOTS) {
    http.expectOne('/api/admin/hub/resellers/voice-agents').flush({ data: agents });
    http.expectOne('/api/admin/hub/resellers/chatbots').flush({ data: chatbots });
    await settle();
  }

  async function render(agents: unknown[] = AGENTS, chatbots: unknown[] = CHATBOTS) {
    const fixture = TestBed.createComponent(AdminAgentsPage);
    await fixture.whenStable();
    await answerLoad(agents, chatbots);
    fixture.detectChanges();
    return fixture;
  }

  const rowsOf = (fixture: { nativeElement: HTMLElement }, testId: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"] tbody tr`)) as HTMLElement[];

  it('lists every voice agent with the customer it belongs to', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture, 'voice-agents');

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Empfang');
    expect(rows[0].textContent).toContain('Lina Mayer');
    expect(rows[1].textContent).toContain(ADMIN_TEXTS.agents.unknownCustomer);
  });

  it('lists the chatbots the same way', async () => {
    const fixture = await render();
    const rows = rowsOf(fixture, 'chatbots');

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Webchat');
    expect(rows[0].textContent).toContain('Lina Mayer');
  });

  it('opens the owning customer and lands in their workspace', async () => {
    const fixture = await render();

    rowsOf(fixture, 'voice-agents')[0]
      .querySelector<HTMLButtonElement>('[data-testid="open-owner"]')
      ?.click();
    await settle();
    const started = http.expectOne('/api/admin/customers/501/impersonate');

    expect(started.request.method).toBe('POST');
    started.flush(CUSTOMER_SESSION);
    await settle();

    expect(TestBed.inject(Router).url).toBe('/app');
  });

  it('offers no jump for an agent whose owner is unknown', async () => {
    const fixture = await render();

    expect(rowsOf(fixture, 'voice-agents')[1].querySelector('[data-testid="open-owner"]')).toBeNull();
  });

  it('says so when the customer has no portal login to open', async () => {
    const fixture = await render();

    rowsOf(fixture, 'voice-agents')[0]
      .querySelector<HTMLButtonElement>('[data-testid="open-owner"]')
      ?.click();
    await settle();
    http
      .expectOne('/api/admin/customers/501/impersonate')
      .flush(
        { error: { code: 'no_portal_login', message: 'This customer has no portal login to open' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(errors).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('says so instead of showing empty tables', async () => {
    const fixture = await render([], []);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(ADMIN_TEXTS.agents.emptyAgents);
    expect(text).toContain(ADMIN_TEXTS.agents.emptyChatbots);
  });
});
