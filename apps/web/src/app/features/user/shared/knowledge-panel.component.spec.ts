import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotifyService } from '../../../core/notify/notify.service';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { KnowledgePanelComponent } from './knowledge-panel.component';

describe('KnowledgePanelComponent', () => {
  let http: HttpTestingController;
  let messages: string[];

  beforeEach(async () => {
    messages = [];
    await TestBed.configureTestingModule({
      imports: [KnowledgePanelComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NotifyService,
          useValue: {
            success: (key: string) => messages.push(`success:${key}`),
            error: (key: string) => messages.push(`error:${key}`),
            apiError: () => messages.push('apiError'),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const FAQ = { id: 11, type: 'url', sourceUrl: 'https://example.com/faq', status: 'ready', title: 'FAQ' };

  async function render(basePath = '/agents/agent_3', data: Record<string, unknown>[] = [FAQ]) {
    const fixture = TestBed.createComponent(KnowledgePanelComponent);
    fixture.componentRef.setInput('basePath', basePath);
    await fixture.whenStable();
    http.expectOne(`/api/hub${basePath}/knowledge`).flush({ data });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the knowledge entries of the owner', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('FAQ');
    expect(text).toContain('https://example.com/faq');
    expect(fixture.nativeElement.querySelector('[data-testid="knowledge-status-11"]')).toBeNull();
  });

  it('marks a source still being processed and one that failed', async () => {
    const fixture = await render('/agents/agent_3', [
      { ...FAQ, status: 'pending' },
      { id: 12, type: 'text', title: 'Hours', status: 'failed', contentSnippet: 'We are open' },
      { id: 13, type: 'crawl', title: 'Website', sourceUrl: 'https://example.com', status: 'ready' },
    ]);

    const pending = fixture.nativeElement.querySelector('[data-testid="knowledge-status-11"]');
    const failed = fixture.nativeElement.querySelector('[data-testid="knowledge-status-12"]');
    expect(pending.textContent.trim()).toBe(USER_TEXTS.knowledge.status.pending);
    expect(failed.textContent.trim()).toBe(USER_TEXTS.knowledge.status.failed);
    expect(failed.classList).toContain('failed');
    const icons = [...fixture.nativeElement.querySelectorAll('mat-icon[matListItemIcon]')].map(
      (icon: Element) => icon.textContent?.trim(),
    );
    expect(icons).toEqual(['link', 'notes', 'language']);
  });

  it('tells the operator when a saved source could not be processed', async () => {
    const fixture = await render();
    fixture.componentInstance.url = 'https://example.com/broken';
    const pending = fixture.componentInstance.addUrl();

    http
      .expectOne('/api/hub/agents/agent_3/knowledge')
      .flush({ id: 14, type: 'url', status: 'failed' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({ data: [] });
    await pending;

    expect(messages).toEqual(['error:user.knowledge.addFailed']);
  });

  it('adds a URL source', async () => {
    const fixture = await render();
    fixture.componentInstance.url = 'https://example.com/pricing';
    const pending = fixture.componentInstance.addUrl();

    const request = http.expectOne('/api/hub/agents/agent_3/knowledge');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ type: 'url', url: 'https://example.com/pricing' });
    request.flush({ id: 12, type: 'url' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({ data: [] });
    await pending;
    expect(fixture.componentInstance.url).toBe('');
    expect(messages).toEqual(['success:user.knowledge.added']);
  });

  it('adds a text source with its title', async () => {
    const fixture = await render();
    fixture.componentInstance.textTitle = 'Opening hours';
    fixture.componentInstance.textContent = 'We are open 9 to 5.';
    const pending = fixture.componentInstance.addText();

    const request = http.expectOne('/api/hub/agents/agent_3/knowledge');
    expect(request.request.body).toEqual({
      type: 'text',
      text: 'We are open 9 to 5.',
      title: 'Opening hours',
    });
    request.flush({ id: 13, type: 'text' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({ data: [] });
    await pending;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.knowledge.empty);
  });

  it('sends a chatbot source in the field that endpoint documents', async () => {
    const fixture = await render('/chatbots/7');
    fixture.componentInstance.url = 'https://example.com/pricing';
    const pending = fixture.componentInstance.addUrl();

    const request = http.expectOne('/api/hub/chatbots/7/knowledge');
    expect(request.request.body).toEqual({ type: 'url', content: 'https://example.com/pricing' });
    request.flush({ id: 12, type: 'url' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/chatbots/7/knowledge').flush({ data: [] });
    await pending;
  });
});
