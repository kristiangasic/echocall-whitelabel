import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext, installAudio } from '../../testing/voice';
import { VoiceSampleError, VoiceService } from './voice.service';

const SAMPLE = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' });

describe('VoiceService', () => {
  let http: HttpTestingController;
  let voice: VoiceService;
  let audio: ReturnType<typeof installAudio>;

  beforeEach(() => {
    audio = installAudio();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    voice = TestBed.inject(VoiceService);
  });

  afterEach(() => {
    voice.stopSample();
    http.verify();
    audio.restore();
  });

  it('asks this portal for the sample, in the agent language', async () => {
    const played = voice.playSample('v-clara', 'de');
    http.expectOne('/api/voice/voices/v-clara/sample?language=de').flush(SAMPLE);
    await played;

    expect(voice.playing()).toBe('v-clara');
    expect(audio.instances[0].sources[0].started).toBe(true);
  });

  it('names no language when the agent has none', async () => {
    const played = voice.playSample('v-clara', null);
    http.expectOne('/api/voice/voices/v-clara/sample').flush(SAMPLE);
    await played;

    expect(voice.playing()).toBe('v-clara');
  });

  it('stops the first voice when a second one is played', async () => {
    const first = voice.playSample('v-clara', 'de');
    http.expectOne('/api/voice/voices/v-clara/sample?language=de').flush(SAMPLE);
    await first;
    const second = voice.playSample('v-tom', 'de');
    http.expectOne('/api/voice/voices/v-tom/sample?language=de').flush(SAMPLE);
    await second;

    expect(audio.instances[0].sources[0].stopped).toBe(true);
    expect(voice.playing()).toBe('v-tom');
  });

  it('stops on request and forgets what was playing', async () => {
    const played = voice.playSample('v-clara', 'de');
    http.expectOne('/api/voice/voices/v-clara/sample?language=de').flush(SAMPLE);
    await played;
    voice.stopSample();

    expect(voice.playing()).toBeNull();
    expect(audio.instances[0].sources[0].stopped).toBe(true);
  });

  it('says so when the bytes are not audio', async () => {
    FakeAudioContext.decodeFails = true;
    const played = voice.playSample('v-clara', 'de');
    http.expectOne('/api/voice/voices/v-clara/sample?language=de').flush(SAMPLE);

    await expect(played).rejects.toBeInstanceOf(VoiceSampleError);
    expect(voice.playing()).toBeNull();
    expect(voice.loading()).toBeNull();
  });

  it('claims a test call from this portal', async () => {
    const answer = {
      streamPath: '/ws/voice-preview?t=abc',
      maxSeconds: 300,
      expiresInSeconds: 60,
      agent: { id: 'agent_7', name: 'Empfang', firstMessage: null, language: 'de' },
    };
    const claimed = voice.claimCall('agent_7');
    const call = http.expectOne('/api/voice/agents/agent_7/call');
    expect(call.request.method).toBe('POST');
    call.flush(answer);

    expect((await claimed).streamPath).toBe('/ws/voice-preview?t=abc');
  });

  it('opens the stream on this portal, not somewhere else', () => {
    const url = voice.streamUrl('/ws/voice-preview?t=abc');

    expect(url.startsWith('ws://') || url.startsWith('wss://')).toBe(true);
    expect(new URL(url).host).toBe(window.location.host);
  });
});
