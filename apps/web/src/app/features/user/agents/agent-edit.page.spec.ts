import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTestI18n } from '../../../testing/i18n';
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
    http.expectOne('/api/hub/languages').flush([{ code: 'de' }, { code: 'en' }]);
    http
      .expectOne('/api/hub/voices')
      .flush({ data: [{ id: 'voice_1', name: 'Clara', status: 'ready', type: 'premade' }] });
    http.expectOne('/api/hub/voices/available').flush({ data: [] });
    return fixture;
  }

  afterEach(() => http.verify());

  it('creates an agent from the form values', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();

    fixture.componentInstance.form.patchValue({
      name: 'Sales',
      language: 'de',
      systemPrompt: 'Be helpful.',
    });
    const pending = fixture.componentInstance.save();

    const request = http.expectOne('/api/hub/agents');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      name: 'Sales',
      language: 'de',
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
    request.flush({ id: 'agent_9', name: 'Sales', language: 'de' }, { status: 201, statusText: 'Created' });
    await pending;
    expect(router.url).toBe('/app/agents');
  });

  it('loads an agent and patches only the changed fields', async () => {
    const fixture = await setup('agent_5');
    http.expectOne('/api/hub/agents/agent_5').flush({
      id: 'agent_5',
      name: 'Support Line',
      language: 'de',
      status: 'active',
      systemPrompt: 'Old prompt',
      voice: { id: 'voice_1', name: 'Clara' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    http.expectOne('/api/hub/agents/agent_5/knowledge').flush({ data: [] });
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
});
