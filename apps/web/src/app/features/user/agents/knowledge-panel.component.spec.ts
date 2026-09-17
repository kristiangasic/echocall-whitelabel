import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { KnowledgePanelComponent } from './knowledge-panel.component';

describe('KnowledgePanelComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgePanelComponent, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(KnowledgePanelComponent);
    fixture.componentRef.setInput('basePath', '/agents/agent_3');
    await fixture.whenStable();
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({
      data: [{ id: 11, type: 'url', sourceUrl: 'https://example.com/faq', status: 'indexed', title: 'FAQ' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the knowledge entries of the owner', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('FAQ');
    expect(text).toContain('indexed');
  });

  it('adds a URL source', async () => {
    const fixture = await render();
    fixture.componentInstance.url = 'https://example.com/pricing';
    const pending = fixture.componentInstance.addUrl();

    const request = http.expectOne('/api/hub/agents/agent_3/knowledge');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ type: 'url', content: 'https://example.com/pricing' });
    request.flush({ id: 12, type: 'url' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({ data: [] });
    await pending;
    expect(fixture.componentInstance.url).toBe('');
  });

  it('adds a text source with its title', async () => {
    const fixture = await render();
    fixture.componentInstance.textTitle = 'Opening hours';
    fixture.componentInstance.textContent = 'We are open 9 to 5.';
    const pending = fixture.componentInstance.addText();

    const request = http.expectOne('/api/hub/agents/agent_3/knowledge');
    expect(request.request.body).toEqual({
      type: 'text',
      content: 'We are open 9 to 5.',
      title: 'Opening hours',
    });
    request.flush({ id: 13, type: 'text' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/knowledge').flush({ data: [] });
    await pending;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.knowledge.empty);
  });
});
