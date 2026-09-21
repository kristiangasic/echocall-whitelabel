import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TEXTS, provideTestI18n } from '../../../testing/i18n';
import { installAudio } from '../../../testing/voice';
import { AgentEditPage } from './agent-edit.page';

@Component({ template: '' })
class BlankPage {}

describe('AgentEditPage', () => {
  let http: HttpTestingController;
  let router: Router;

  async function setup(id: string) {
    await TestBed.configureTestingModule({
      imports: [AgentEditPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app/agents', component: BlankPage }]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(AgentEditPage);
    await fixture.whenStable();
    flushLanguages();
    http
      .expectOne('/api/hub/voices')
      .flush({ data: [{ id: 'voice_1', name: 'Clara', status: 'ready', type: 'premade' }] });
    http.expectOne('/api/hub/voices/available').flush({ data: [] });
    return fixture;
  }

  /**
   * The languages an agent can speak come from the platform and depend on the
   * speech model, so the page asks again whenever that model changes.
   */
  function flushLanguages(): void {
    const requests = http.match(
      (r) => r.url === '/api/hub/languages/agent' && r.params.get('type') === 'voice',
    );
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      request.flush({
        data: [
          { code: 'de', name: 'German', nativeName: 'Deutsch', flag: 'de' },
          { code: 'en', name: 'English', nativeName: 'English', flag: 'gb' },
        ],
        meta: { type: 'voice', ttsModel: 'echocall-flash', count: 2, source: 'catalog' },
      });
    }
  }

  let audio: ReturnType<typeof installAudio>;

  beforeEach(() => (audio = installAudio()));

  afterEach(() => {
    http.verify();
    audio.restore();
  });

  /** Lets a click that starts a request reach the testing backend. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function click(fixture: { nativeElement: HTMLElement }, testId: string): void {
    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (!button) throw new Error(`No element with data-testid="${testId}"`);
    button.click();
  }

  it('creates an agent from the form values', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();

    fixture.componentInstance.form.patchValue({
      name: 'Sales',
      language: 'en',
      systemPrompt: 'Be helpful.',
    });
    const pending = fixture.componentInstance.save();

    const request = http.expectOne('/api/hub/agents');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      name: 'Sales',
      language: 'en',
      systemPrompt: 'Be helpful.',
      llmModel: 'EchoCall-Voice',
      enableInterruptions: true,
      retentionDays: 30,
      systemToolsConfig: {
        endCall: false,
        voicemailDetection: false,
        languageDetection: false,
        playKeypadTouchTone: false,
        skipTurn: false,
      },
    });
    expect(request.request.body).not.toHaveProperty('voiceId');
    expect(request.request.body).not.toHaveProperty('status');
    request.flush({ id: 'agent_9', name: 'Sales', language: 'en' }, { status: 201, statusText: 'Created' });
    await pending;
    expect(router.url).toBe('/app/agents');
  });

  it('loads an agent and patches only the changed fields', async () => {
    const fixture = await setup('agent_5');
    http.expectOne('/api/hub/agents/agent_5').flush({
      id: 'agent_5',
      name: 'Support Line',
      language: 'en',
      status: 'active',
      systemPrompt: 'Old prompt',
      voice: { id: 'voice_1', name: 'Clara' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    http.expectOne('/api/hub/agents/agent_5/knowledge').flush({ data: [] });
    http.expectOne('/api/hub/agents/agent_5/integrations').flush({ data: [] });
    http.expectOne('/api/hub/integrations').flush([]);
    await fixture.whenStable();

    const form = fixture.componentInstance.form;
    expect(form.controls.name.value).toBe('Support Line');
    form.controls.systemPrompt.setValue('New prompt');
    form.controls.systemPrompt.markAsDirty();
    const pending = fixture.componentInstance.save();

    const request = http.expectOne('/api/hub/agents/agent_5');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ systemPrompt: 'New prompt' });
    request.flush({ id: 'agent_5' });
    await pending;
    expect(router.url).toBe('/app/agents');
  });
  it('says the name is missing instead of doing nothing', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();

    await fixture.componentInstance.save();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });

  it('plays a sample of the chosen voice, in the language of the agent', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();
    fixture.componentInstance.form.patchValue({ voiceId: 'voice_1', language: 'de' });
    fixture.detectChanges();

    click(fixture, 'voice-preview');
    await settle();

    const request = http.expectOne('/api/voice/voices/voice_1/sample?language=de');
    expect(request.request.method).toBe('GET');
    request.flush(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }));
    await settle();
  });

  it('offers a test call only once the agent exists', async () => {
    const fresh = await setup('new');
    await fresh.whenStable();
    fresh.detectChanges();
    expect(fresh.nativeElement.querySelector('[data-testid="agent-test-call"]')).toBeNull();

    TestBed.resetTestingModule();
    const saved = await setup('agent_5');
    http.expectOne('/api/hub/agents/agent_5').flush({ id: 'agent_5', name: 'Support Line', language: 'de' });
    await settle();
    await saved.whenStable();
    http.expectOne('/api/hub/agents/agent_5/knowledge').flush({ data: [] });
    http.expectOne('/api/hub/agents/agent_5/integrations').flush({ data: [] });
    http.expectOne('/api/hub/integrations').flush([]);
    saved.detectChanges();

    expect(saved.nativeElement.querySelector('[data-testid="agent-test-call"]')).not.toBeNull();
  });
});
