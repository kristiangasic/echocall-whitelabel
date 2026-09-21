/**
 * A test call in the browser, without a phone.
 *
 * The page asks the portal for a one-time address and opens it here. From
 * then on this module owns the microphone, the speaker and the socket, and
 * reports what happens through one callback: the moment the line is open,
 * every sentence either side says, whether the agent is talking right now,
 * and how the call ended.
 *
 * The other end of the socket is this portal, which relays the call on. The
 * wire format is the portal's own, JSON text frames:
 *
 *   portal -> here  { type: 'ready', maxSeconds, audio: { microphone, speaker } }
 *                     each of microphone/speaker is { codec: 'pcm'|'ulaw', rate }
 *                   { type: 'audio', chunk }     base64, in the speaker format
 *                   { type: 'agent', text }      a sentence the agent said
 *                   { type: 'user', text }       what the agent understood
 *                   { type: 'interrupt' }        stop playing, the caller spoke
 *                   { type: 'end', reason }      'agent' | 'timeout' | 'error'
 *   here -> portal  { type: 'audio', chunk }     base64, in the microphone format
 *                   { type: 'end' }              the caller hung up
 *
 * Audio is raw 16-bit samples at the rate the portal announces in `ready`.
 * The microphone keeps streaming while the agent speaks, because the far end
 * is what notices an interruption.
 */

export type CallEndReason = 'agent' | 'hangup' | 'timeout' | 'error';

export type VoiceCallEvent =
  | { type: 'connected' }
  | { type: 'agent_speaking'; speaking: boolean }
  | { type: 'agent_text'; text: string }
  | { type: 'user_text'; text: string }
  | { type: 'ended'; reason: CallEndReason; seconds: number };

export interface VoiceCall {
  /** Ends the call from this side. Safe to call more than once. */
  hangUp: () => void;
}

/** Thrown by requestMicrophone when the browser gives no microphone. */
export class MicrophoneError extends Error {
  readonly blocked: boolean;

  constructor(blocked: boolean) {
    super(blocked ? 'microphone_blocked' : 'microphone_unavailable');
    this.name = 'MicrophoneError';
    this.blocked = blocked;
  }
}

/**
 * Asks for the microphone first, before a call is claimed.
 *
 * A caller who declines the permission has not made a call, and minutes must
 * not be spent on one that never happened. That is why this is separate from
 * startVoiceCall and why the page awaits it before asking for a connection.
 */
export async function requestMicrophone(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError(false);
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : '';
    const blocked =
      name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
    throw new MicrophoneError(blocked);
  }
}

/** True when the browser can do what the call needs. */
export function canMakeCalls(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return Boolean(w.AudioContext || w.webkitAudioContext) && typeof WebSocket !== 'undefined';
}

interface Params {
  /** The portal's websocket address for this one call, ticket included. */
  streamUrl: string;
  stream: MediaStream;
  /** Client-side cap; the portal enforces the same number independently. */
  maxSeconds: number;
  onEvent: (event: VoiceCallEvent) => void;
}

interface AudioFormat {
  codec: 'pcm' | 'ulaw';
  rate: number;
}

const MIC_BUFFER_SIZE = 4096;

export function startVoiceCall({ streamUrl, stream, maxSeconds, onEvent }: Params): VoiceCall {
  const w = window as unknown as {
    AudioContext: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctx = w.AudioContext || w.webkitAudioContext;
  const ctx = new Ctx();
  void ctx.resume().catch(() => undefined);

  let ws: WebSocket | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let silence: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let microphone: AudioFormat = { codec: 'pcm', rate: 16000 };
  let speaker: AudioFormat = { codec: 'pcm', rate: 16000 };

  let connectedAt = 0;
  let ended = false;
  let closingReason: CallEndReason | null = null;

  const playing = new Set<AudioBufferSourceNode>();
  let nextPlayTime = 0;
  let speaking = false;

  const emit = (event: VoiceCallEvent) => {
    try {
      onEvent(event);
    } catch {
      // A listener that throws must not take the call down with it.
    }
  };

  const setSpeaking = (value: boolean) => {
    if (speaking === value) {
      return;
    }
    speaking = value;
    emit({ type: 'agent_speaking', speaking: value });
  };

  const stopPlayback = () => {
    for (const node of playing) {
      try {
        node.onended = null;
        node.stop();
      } catch {
        // Already finished.
      }
    }
    playing.clear();
    nextPlayTime = 0;
    setSpeaking(false);
  };

  const finish = (reason: CallEndReason) => {
    if (ended) {
      return;
    }
    ended = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    stopPlayback();
    try {
      processor?.disconnect();
      source?.disconnect();
      silence?.disconnect();
    } catch {
      // Nodes may already be gone.
    }
    if (processor) {
      processor.onaudioprocess = null;
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'end' }));
        ws.close(1000);
      } catch {
        // Closing twice is harmless.
      }
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close();
      } catch {
        // Never opened.
      }
    }
    void ctx.close().catch(() => undefined);
    const seconds = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
    emit({ type: 'ended', reason, seconds });
  };

  const hangUp = () => {
    if (ended) {
      return;
    }
    closingReason = closingReason ?? 'hangup';
    finish(closingReason);
  };

  const startMicrophone = () => {
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(MIC_BUFFER_SIZE, 1, 1);
    silence = ctx.createGain();
    silence.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || ended) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsample(input, ctx.sampleRate, microphone.rate);
      const bytes =
        microphone.codec === 'ulaw'
          ? int16ToUlaw(pcm)
          : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      ws.send(JSON.stringify({ type: 'audio', chunk: bytesToBase64(bytes) }));
    };

    // The processor only runs while it is wired to the destination, so it
    // goes through a muted gain node: the microphone must never be audible
    // through the visitor's own speakers.
    source.connect(processor);
    processor.connect(silence);
    silence.connect(ctx.destination);
  };

  const playChunk = (base64: string) => {
    const bytes = base64ToBytes(base64);
    let samples: Float32Array<ArrayBuffer>;
    if (speaker.codec === 'ulaw') {
      samples = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        samples[i] = ulawToInt16(bytes[i]) / 32768;
      }
    } else {
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      samples = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        samples[i] = int16[i] / 32768;
      }
    }
    if (samples.length === 0) {
      return;
    }

    const buffer = ctx.createBuffer(1, samples.length, speaker.rate);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTime);
    node.start(startAt);
    nextPlayTime = startAt + buffer.duration;
    playing.add(node);
    setSpeaking(true);
    node.onended = () => {
      playing.delete(node);
      if (playing.size === 0) {
        setSpeaking(false);
      }
    };
  };

  const readFormat = (value: unknown, fallback: AudioFormat): AudioFormat => {
    const record = value && typeof value === 'object' ? (value as { codec?: unknown; rate?: unknown }) : null;
    const rate = typeof record?.rate === 'number' && record.rate > 0 ? record.rate : fallback.rate;
    const codec = record?.codec === 'ulaw' ? 'ulaw' : 'pcm';
    return { codec, rate };
  };

  const handleMessage = (raw: string) => {
    let data: { type?: unknown; [key: string]: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') {
      return;
    }
    switch (data.type) {
      case 'ready': {
        if (connectedAt) {
          return;
        }
        const audio =
          data['audio'] && typeof data['audio'] === 'object'
            ? (data['audio'] as { microphone?: unknown; speaker?: unknown })
            : {};
        microphone = readFormat(audio.microphone, microphone);
        speaker = readFormat(audio.speaker, speaker);
        connectedAt = Date.now();
        timer = setTimeout(() => {
          closingReason = 'timeout';
          finish('timeout');
        }, maxSeconds * 1000);
        try {
          startMicrophone();
        } catch {
          finish('error');
          return;
        }
        emit({ type: 'connected' });
        return;
      }
      case 'audio': {
        if (typeof data['chunk'] === 'string' && data['chunk']) {
          playChunk(data['chunk']);
        }
        return;
      }
      case 'agent': {
        if (typeof data['text'] === 'string' && data['text'].trim()) {
          emit({ type: 'agent_text', text: data['text'].trim() });
        }
        return;
      }
      case 'user': {
        if (typeof data['text'] === 'string' && data['text'].trim()) {
          emit({ type: 'user_text', text: data['text'].trim() });
        }
        return;
      }
      case 'interrupt':
        stopPlayback();
        return;
      case 'end': {
        const reason = data['reason'] === 'timeout' || data['reason'] === 'error' ? data['reason'] : 'agent';
        closingReason = closingReason ?? reason;
        finish(closingReason);
        return;
      }
      default:
        return;
    }
  };

  try {
    ws = new WebSocket(streamUrl);
  } catch {
    finish('error');
    return { hangUp };
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      handleMessage(event.data);
    }
  };
  ws.onerror = () => {
    if (!connectedAt) {
      finish('error');
    }
  };
  ws.onclose = () => {
    if (ended) {
      return;
    }
    // The portal hung up without a word: the line dropped. Before it was ever
    // open, a close is a failure.
    finish(closingReason ?? (connectedAt ? 'agent' : 'error'));
  };

  return { hangUp };
}

// ---------------------------------------------------------------------------
// Sample helpers
// ---------------------------------------------------------------------------

function downsample(input: Float32Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate;
  if (ratio <= 1) {
    return float32ToInt16(input);
  }
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

const ULAW_BIAS = 0x84;
const ULAW_CLIP = 32635;

function int16ToUlaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = linearToUlaw(pcm[i]);
  }
  return out;
}

function linearToUlaw(sample: number): number {
  let s = sample;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) {
    s = -s;
  }
  if (s > ULAW_CLIP) {
    s = ULAW_CLIP;
  }
  s += ULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    // Find the highest set bit.
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function ulawToInt16(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const t = ((mantissa << 3) + ULAW_BIAS) << exponent;
  return sign ? ULAW_BIAS - t : t - ULAW_BIAS;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
