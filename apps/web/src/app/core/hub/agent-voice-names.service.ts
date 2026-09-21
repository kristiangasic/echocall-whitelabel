import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AvailableVoice } from './hub.models';
import { HubService } from './hub.service';

/**
 * Names the voice an agent speaks with.
 *
 * An agent stores the voice as an identifier and, since recently, its name
 * alongside. Agents that were set up before that keep no name, so a list that
 * only prints what the agent carries calls a chosen voice the default one. The
 * service reads the voices on offer once per session and fills that gap; a
 * voice it cannot find keeps whatever the caller decides to print instead.
 */
@Injectable({ providedIn: 'root' })
export class AgentVoiceNames {
  private readonly hub = inject(HubService);
  private readonly byId = signal<Record<string, string>>({});
  private pending: Promise<void> | null = null;

  /** Fetches the voices once. Later callers wait on the first call. */
  load(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.fetch().catch(() => {
      // A list that names no voice is a small loss; a list that fails to load is not.
      this.pending = null;
    });
    return this.pending;
  }

  /** The name of a voice, or an empty string while the voices are unknown. */
  name(id: string | null | undefined): string {
    if (!id) return '';
    return this.byId()[id] ?? '';
  }

  private async fetch(): Promise<void> {
    const voices = await firstValueFrom(this.hub.list<AvailableVoice>('/voices/available'));
    const merged = { ...this.byId() };
    for (const voice of voices) {
      if (voice.id && voice.name) merged[voice.id] = voice.name;
    }
    this.byId.set(merged);
  }
}
