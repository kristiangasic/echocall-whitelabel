import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';

/** What the portal answers when a test call is claimed. */
export interface TestCall {
  /** Path on this portal, ticket included. Open it as a websocket. */
  streamPath: string;
  maxSeconds: number;
  expiresInSeconds: number;
  agent: { id: string; name: string; firstMessage: string | null; language: string | null };
}

/** Raised when a voice cannot be heard, so the page can say which reason it was. */
export class VoiceSampleError extends Error {
  constructor(readonly reason: 'unsupported' | 'unavailable') {
    super(reason);
    this.name = 'VoiceSampleError';
  }
}

type AudioContextCtor = typeof AudioContext;

/** The browser's audio engine, under either of the two names it has. */
function audioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Hearing a voice, and calling an agent.
 *
 * Both run over the portal's own address. A sample arrives as audio bytes and
 * is played through the browser's audio engine rather than from a file the
 * page points at, so nothing about where the speech is made ever reaches the
 * page. A test call is claimed here and then run by `startVoiceCall`.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly api = inject(ApiService);

  /** The voice being played right now, so a button can offer to stop it. */
  readonly playing = signal<string | null>(null);
  /** The voice whose sample is still being fetched. */
  readonly loading = signal<string | null>(null);

  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** Whether this browser can play a sample or make a call at all. */
  canPlay(): boolean {
    return audioContextCtor() !== null;
  }

  /**
   * Plays one sentence in the given voice. A second call stops the first: two
   * voices at once tell the listener nothing.
   */
  async playSample(voiceId: string, language?: string | null): Promise<void> {
    this.stopSample();
    const Ctx = audioContextCtor();
    if (Ctx === null) throw new VoiceSampleError('unsupported');
    this.loading.set(voiceId);
    let audio: ArrayBuffer;
    try {
      const query = language ? `?language=${encodeURIComponent(language)}` : '';
      const blob = await firstValueFrom(
        this.api.blob(`/voice/voices/${encodeURIComponent(voiceId)}/sample${query}`),
      );
      audio = await blob.arrayBuffer();
    } finally {
      this.loading.set(null);
    }

    const context = (this.context ??= new Ctx());
    await context.resume().catch(() => undefined);
    let buffer: AudioBuffer;
    try {
      buffer = await context.decodeAudioData(audio);
    } catch {
      throw new VoiceSampleError('unavailable');
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.playing.set(null);
      }
    };
    this.source = source;
    this.playing.set(voiceId);
    source.start();
  }

  /** Stops whatever is playing. Safe to call when nothing is. */
  stopSample(): void {
    const source = this.source;
    this.source = null;
    this.playing.set(null);
    if (source === null) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // It had already finished.
    }
  }

  /** Claims a test call with one of the customer's own agents. */
  claimCall(agentId: string): Promise<TestCall> {
    return firstValueFrom(this.api.post<TestCall>(`/voice/agents/${encodeURIComponent(agentId)}/call`));
  }

  /** The address the browser opens for a claimed call, on this portal's own origin. */
  streamUrl(streamPath: string): string {
    const url = new URL(streamPath, window.location.origin);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    return url.toString();
  }
}
