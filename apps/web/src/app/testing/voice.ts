/**
 * Stand-ins for the three browser parts a voice call needs and jsdom has
 * none of: the audio engine, the microphone and the websocket. Each install
 * function returns what the spec needs to drive it, and a restore it must
 * call afterwards.
 */

class FakeBufferSource {
  connected = false;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeProcessor {
  onaudioprocess: ((event: unknown) => void) | null = null;
  connected = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  readonly destination = {};
  readonly sampleRate = 48000;
  currentTime = 0;
  closed = false;
  readonly sources: FakeBufferSource[] = [];
  /** Set by a spec to make decoding fail, as a broken sample would. */
  static decodeFails = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  decodeAudioData(data: ArrayBuffer): Promise<unknown> {
    if (FakeAudioContext.decodeFails) return Promise.reject(new Error('not audio'));
    return Promise.resolve({ duration: data.byteLength / 1000, length: data.byteLength });
  }

  createBuffer(channels: number, length: number, rate: number): unknown {
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      duration: length / rate,
      copyToChannel: () => undefined,
    };
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createMediaStreamSource(): unknown {
    return { connect: () => undefined, disconnect: () => undefined };
  }

  createScriptProcessor(): FakeProcessor {
    return new FakeProcessor();
  }

  createGain(): unknown {
    return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined };
  }
}

/** Puts the fake audio engine in place and hands back the instances it makes. */
export function installAudio(): { instances: FakeAudioContext[]; restore: () => void } {
  const holder = window as unknown as { AudioContext?: unknown };
  const previous = holder.AudioContext;
  FakeAudioContext.instances = [];
  FakeAudioContext.decodeFails = false;
  holder.AudioContext = FakeAudioContext;
  return {
    instances: FakeAudioContext.instances,
    restore: () => {
      holder.AudioContext = previous;
      FakeAudioContext.instances = [];
      FakeAudioContext.decodeFails = false;
    },
  };
}

/** A microphone that is there, or one the browser refuses to hand over. */
export function installMicrophone(outcome: 'granted' | 'blocked' | 'missing'): { restore: () => void } {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const getUserMedia = (): Promise<MediaStream> => {
    if (outcome === 'blocked') {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      return Promise.reject(error);
    }
    const track = { stop: () => undefined };
    return Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream);
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: outcome === 'missing' ? undefined : { getUserMedia },
    configurable: true,
  });
  return {
    restore: () => {
      if (previous) Object.defineProperty(navigator, 'mediaDevices', previous);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    },
  };
}

/** One socket the spec can answer as the portal would. */
export class FakeSocket {
  static opened: FakeSocket[] = [];
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  closedWith: number | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.readyState = 3;
    this.closedWith = code ?? 1000;
  }

  /** Delivers a frame as the portal would. */
  say(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

/** Puts the fake websocket in place and hands back the sockets that get opened. */
export function installSocket(): { opened: FakeSocket[]; restore: () => void } {
  const holder = window as unknown as { WebSocket?: unknown };
  const previous = holder.WebSocket;
  FakeSocket.opened = [];
  holder.WebSocket = FakeSocket;
  return {
    opened: FakeSocket.opened,
    restore: () => {
      holder.WebSocket = previous;
      FakeSocket.opened = [];
    },
  };
}
