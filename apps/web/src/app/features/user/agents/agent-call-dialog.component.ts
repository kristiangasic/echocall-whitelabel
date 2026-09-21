import { Component, DestroyRef, inject, type OnDestroy, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  type CallEndReason,
  MicrophoneError,
  requestMicrophone,
  startVoiceCall,
  type VoiceCall,
} from '../../../core/voice/voice-call';
import { VoiceService } from '../../../core/voice/voice.service';

export interface AgentCallDialogData {
  agentId: string;
  agentName: string;
}

/** One line of the running transcript. */
interface Line {
  side: 'agent' | 'you';
  text: string;
}

/** Where the call is: nothing yet, being set up, running, over. */
type Stage = 'idle' | 'connecting' | 'live' | 'ended';

/**
 * Calling one of the customer's own agents from the browser, to hear how it
 * answers before a real caller does.
 *
 * The microphone is asked for first, because a refused permission must not
 * cost a claimed call. Everything after that belongs to the call engine; this
 * component only shows what it reports, and hangs up when the dialog closes.
 */
@Component({
  selector: 'app-agent-call-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, TranslocoDirective],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('user.agents.preview.callTitle', { name: data.agentName }) }}</h2>
      <mat-dialog-content>
        @if (stage() === 'idle') {
          <p class="hint">{{ t('user.agents.preview.callHint') }}</p>
        }
        @if (stage() === 'connecting') {
          <p class="status">{{ t('user.agents.preview.connecting') }}</p>
          <mat-progress-bar mode="indeterminate" />
        }
        @if (stage() === 'live') {
          <p class="status">
            <span class="dot" [class.on]="speaking()"></span>
            {{ speaking() ? t('user.agents.preview.speaking') : t('user.agents.preview.listening') }}
            <span class="remaining">{{ t('user.agents.preview.remaining', { seconds: remaining() }) }}</span>
          </p>
        }
        @if (stage() === 'ended' && endedMessage(); as message) {
          <p class="status" data-testid="call-ended">{{ t(message.key, message.params) }}</p>
        }
        @if (stage() !== 'idle') {
          <div class="transcript" data-testid="call-transcript">
            @for (line of lines(); track $index) {
              <p class="line" [class.agent]="line.side === 'agent'">
                <span class="who">{{
                  line.side === 'agent' ? t('user.agents.preview.agent') : t('user.agents.preview.you')
                }}</span>
                {{ line.text }}
              </p>
            } @empty {
              <p class="empty">{{ t('user.agents.preview.transcriptEmpty') }}</p>
            }
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (stage() === 'live' || stage() === 'connecting') {
          <button
            mat-flat-button
            class="destructive"
            type="button"
            (click)="hangUp()"
            data-testid="call-hang-up"
          >
            <mat-icon>stop</mat-icon>
            {{ t('user.agents.preview.hangUp') }}
          </button>
        } @else {
          <button mat-button mat-dialog-close type="button">{{ t('actions.close') }}</button>
          @if (stage() === 'idle') {
            <button mat-flat-button type="button" (click)="start()" data-testid="call-start">
              <mat-icon>call</mat-icon>
              {{ t('user.agents.preview.start') }}
            </button>
          }
        }
      </mat-dialog-actions>
    </ng-container>
  `,
  styles: `
    .hint,
    .status {
      margin: 0 0 12px;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font: var(--mat-sys-body-medium);
    }
    .remaining {
      margin-left: auto;
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
    /* A quiet light, so the caller can tell who has the floor. */
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--mat-sys-outline);
      flex: none;
    }
    .dot.on {
      background: var(--mat-sys-primary);
    }
    .transcript {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 40vh;
      overflow-y: auto;
      padding-right: 4px;
      min-width: min(420px, 60vw);
    }
    .line {
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
    .who {
      margin-right: 8px;
      font: var(--mat-sys-label-small);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--mat-sys-on-surface-variant);
    }
    .line.agent .who {
      color: var(--mat-sys-primary);
    }
    .empty {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class AgentCallDialogComponent implements OnDestroy {
  readonly data = inject<AgentCallDialogData>(MAT_DIALOG_DATA);
  private readonly voice = inject(VoiceService);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly stage = signal<Stage>('idle');
  readonly speaking = signal(false);
  readonly remaining = signal(0);
  readonly lines = signal<Line[]>([]);
  readonly endedMessage = signal<{ key: string; params?: Record<string, unknown> } | null>(null);

  private call: VoiceCall | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopEverything());
  }

  ngOnDestroy(): void {
    this.stopEverything();
  }

  async start(): Promise<void> {
    if (this.stage() !== 'idle') return;
    if (!this.voice.canPlay()) {
      this.endWith('user.agents.preview.unsupported');
      return;
    }
    this.stage.set('connecting');
    let stream: MediaStream;
    try {
      stream = await requestMicrophone();
    } catch (error) {
      const blocked = error instanceof MicrophoneError && error.blocked;
      this.endWith(blocked ? 'user.agents.preview.micBlocked' : 'user.agents.preview.micUnavailable');
      return;
    }
    try {
      const claimed = await this.voice.claimCall(this.data.agentId);
      this.remaining.set(claimed.maxSeconds);
      this.call = startVoiceCall({
        streamUrl: this.voice.streamUrl(claimed.streamPath),
        stream,
        maxSeconds: claimed.maxSeconds,
        onEvent: (event) => {
          switch (event.type) {
            case 'connected':
              this.stage.set('live');
              this.startTicker();
              return;
            case 'agent_speaking':
              this.speaking.set(event.speaking);
              return;
            case 'agent_text':
              this.lines.update((lines) => [...lines, { side: 'agent', text: event.text }]);
              return;
            case 'user_text':
              this.lines.update((lines) => [...lines, { side: 'you', text: event.text }]);
              return;
            case 'ended':
              this.finish(event.reason, event.seconds);
              return;
          }
        },
      });
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      this.stage.set('idle');
      this.notify.apiError(error);
    }
  }

  hangUp(): void {
    this.call?.hangUp();
    if (this.stage() === 'connecting') this.finish('hangup', 0);
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => {
      const left = this.remaining() - 1;
      this.remaining.set(left > 0 ? left : 0);
      if (left <= 0) this.stopTicker();
    }, 1000);
  }

  private stopTicker(): void {
    if (this.ticker === null) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  private finish(reason: CallEndReason, seconds: number): void {
    this.stopTicker();
    this.call = null;
    this.speaking.set(false);
    this.stage.set('ended');
    if (reason === 'timeout') this.endedMessage.set({ key: 'user.agents.preview.endedTimeout' });
    else if (reason === 'error') this.endedMessage.set({ key: 'user.agents.preview.endedError' });
    else this.endedMessage.set({ key: 'user.agents.preview.ended', params: { seconds } });
  }

  private endWith(key: string): void {
    this.stage.set('ended');
    this.endedMessage.set({ key });
  }

  private stopEverything(): void {
    this.stopTicker();
    this.call?.hangUp();
    this.call = null;
  }
}
