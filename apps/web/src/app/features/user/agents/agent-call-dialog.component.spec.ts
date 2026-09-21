import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { byTestId } from '../../../testing/dom';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { type FakeSocket, installAudio, installMicrophone, installSocket } from '../../../testing/voice';
import { AgentCallDialogComponent } from './agent-call-dialog.component';

const CALL = {
  streamPath: '/ws/voice-preview?t=abc',
  maxSeconds: 300,
  expiresInSeconds: 60,
  agent: { id: 'agent_7', name: 'Empfang', firstMessage: 'Guten Tag', language: 'de' },
};

const TEXTS = USER_TEXTS.agents.preview;

/** Lets the promises inside the component settle before the DOM is read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AgentCallDialogComponent', () => {
  let http: HttpTestingController;
  let audio: ReturnType<typeof installAudio>;
  let sockets: ReturnType<typeof installSocket>;
  let microphone: { restore: () => void } | null = null;

  async function open(): Promise<ComponentFixture<AgentCallDialogComponent>> {
    await TestBed.configureTestingModule({
      imports: [AgentCallDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { agentId: 'agent_7', agentName: 'Empfang' } },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AgentCallDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    audio = installAudio();
    sockets = installSocket();
  });

  afterEach(() => {
    microphone?.restore();
    microphone = null;
    sockets.restore();
    audio.restore();
    TestBed.resetTestingModule();
  });

  it('explains what a test call costs before it starts one', async () => {
    microphone = installMicrophone('granted');
    const fixture = await open();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(TEXTS.callHint);
    expect(byTestId(fixture, 'call-start')).toBeTruthy();
    http.verify();
  });

  it('runs the call over this portal and shows what is said', async () => {
    microphone = installMicrophone('granted');
    const fixture = await open();
    byTestId<HTMLButtonElement>(fixture, 'call-start').click();
    await settle();
    http.expectOne('/api/voice/agents/agent_7/call').flush(CALL);
    await settle();

    const socket = sockets.opened[0] as FakeSocket;
    expect(new URL(socket.url).host).toBe(window.location.host);
    expect(socket.url).toContain('/ws/voice-preview?t=abc');

    socket.say({ type: 'ready', maxSeconds: 300, audio: { microphone: { codec: 'pcm', rate: 16000 } } });
    socket.say({ type: 'agent', text: 'Guten Tag, wie kann ich helfen?' });
    socket.say({ type: 'user', text: 'Ich habe eine Frage.' });
    fixture.detectChanges();

    const transcript = byTestId(fixture, 'call-transcript').textContent ?? '';
    expect(transcript).toContain('Guten Tag, wie kann ich helfen?');
    expect(transcript).toContain('Ich habe eine Frage.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(TEXTS.listening);

    byTestId<HTMLButtonElement>(fixture, 'call-hang-up').click();
    fixture.detectChanges();
    expect(socket.sent.some((frame) => frame.includes('"end"'))).toBe(true);
    http.verify();
  });

  it('says the agent is speaking while it speaks', async () => {
    microphone = installMicrophone('granted');
    const fixture = await open();
    byTestId<HTMLButtonElement>(fixture, 'call-start').click();
    await settle();
    http.expectOne('/api/voice/agents/agent_7/call').flush(CALL);
    await settle();

    const socket = sockets.opened[0] as FakeSocket;
    socket.say({ type: 'ready', maxSeconds: 300, audio: {} });
    socket.say({ type: 'audio', chunk: btoa('\u0001\u0002\u0003\u0004') });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(TEXTS.speaking);
    byTestId<HTMLButtonElement>(fixture, 'call-hang-up').click();
    http.verify();
  });

  it('claims no call when the microphone is refused', async () => {
    microphone = installMicrophone('blocked');
    const fixture = await open();
    byTestId<HTMLButtonElement>(fixture, 'call-start').click();
    await settle();
    fixture.detectChanges();

    expect(byTestId(fixture, 'call-ended').textContent).toContain(TEXTS.micBlocked);
    expect(sockets.opened).toHaveLength(0);
    http.verify();
  });

  it('claims no call when there is no microphone at all', async () => {
    microphone = installMicrophone('missing');
    const fixture = await open();
    byTestId<HTMLButtonElement>(fixture, 'call-start').click();
    await settle();
    fixture.detectChanges();

    expect(byTestId(fixture, 'call-ended').textContent).toContain(TEXTS.micUnavailable);
    http.verify();
  });

  it('reports a call the service would not start', async () => {
    microphone = installMicrophone('granted');
    const fixture = await open();
    byTestId<HTMLButtonElement>(fixture, 'call-start').click();
    await settle();
    http.expectOne('/api/voice/agents/agent_7/call').flush(
      { error: { code: 'quota_exceeded', message: 'No minutes left' } },
      { status: 402, statusText: 'Payment Required' },
    );
    await settle();
    fixture.detectChanges();

    expect(sockets.opened).toHaveLength(0);
    expect(byTestId(fixture, 'call-start')).toBeTruthy();
  });
});
