import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';

/**
 * The fields both owners report. Voice agents carry sourceUrl and status,
 * chatbots carry contentSnippet and fileName instead.
 */
export interface KnowledgePanelEntry {
  id: number;
  type: 'url' | 'text' | 'file';
  title?: string | null;
  sourceUrl?: string | null;
  status?: string | null;
  contentSnippet?: string | null;
  fileName?: string | null;
}

/**
 * Knowledge sources of one agent or chatbot: list, add a URL or a text,
 * re-crawl a URL source, delete. basePath is the hub path of the owner,
 * for example /agents/agent_3 or /chatbots/7.
 */
@Component({
  selector: 'app-knowledge-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-list data-testid="knowledge-list">
        @for (entry of entries(); track entry.id) {
          <mat-list-item>
            <mat-icon matListItemIcon>{{ entry.type === 'url' ? 'link' : 'notes' }}</mat-icon>
            <span matListItemTitle>{{ label(entry) }}</span>
            <span matListItemLine>{{ entry.status || entry.contentSnippet || '' }}</span>
            <span matListItemMeta class="entry-actions">
              @if (entry.type === 'url') {
                <button
                  mat-icon-button
                  type="button"
                  (click)="refresh(entry)"
                  [attr.aria-label]="t('user.knowledge.refresh')"
                >
                  <mat-icon>sync</mat-icon>
                </button>
              }
              <button
                mat-icon-button
                type="button"
                (click)="remove(entry)"
                [attr.aria-label]="t('actions.delete')"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </span>
          </mat-list-item>
        } @empty {
          <p class="empty">{{ t('user.knowledge.empty') }}</p>
        }
      </mat-list>

      <form class="add-row" (ngSubmit)="addUrl()">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>{{ t('user.knowledge.addUrlLabel') }}</mat-label>
          <input
            matInput
            type="url"
            name="url"
            [(ngModel)]="url"
            placeholder="https://example.com/help"
            data-testid="knowledge-url"
          />
        </mat-form-field>
        <button mat-stroked-button type="submit" [disabled]="!url.trim() || busy()">
          <mat-icon>add_link</mat-icon>
          {{ t('user.knowledge.addUrl') }}
        </button>
      </form>

      <form class="add-block" (ngSubmit)="addText()">
        <mat-form-field appearance="outline">
          <mat-label>{{ t('user.knowledge.textTitle') }}</mat-label>
          <input matInput name="textTitle" [(ngModel)]="textTitle" data-testid="knowledge-title" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ t('user.knowledge.textContent') }}</mat-label>
          <textarea
            matInput
            name="textContent"
            [(ngModel)]="textContent"
            rows="4"
            data-testid="knowledge-text"
          ></textarea>
        </mat-form-field>
        <button mat-stroked-button type="submit" [disabled]="!textContent.trim() || busy()">
          <mat-icon>post_add</mat-icon>
          {{ t('user.knowledge.addText') }}
        </button>
      </form>
    </ng-container>
  `,
  styles: `
    .add-row {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
      min-width: 240px;
    }
    .add-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    .add-block mat-form-field {
      align-self: stretch;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      padding: 8px 16px;
    }
    .entry-actions {
      display: flex;
      gap: 4px;
    }
  `,
})
export class KnowledgePanelComponent implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  /** Hub path of the owner, for example /agents/agent_3 or /chatbots/7. */
  readonly basePath = input.required<string>();

  readonly entries = signal<KnowledgePanelEntry[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);

  url = '';
  textTitle = '';
  textContent = '';

  ngOnInit(): void {
    void this.load();
  }

  label(entry: KnowledgePanelEntry): string {
    return entry.title || entry.sourceUrl || entry.fileName || `#${entry.id}`;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.entries.set(
        await firstValueFrom(this.hub.list<KnowledgePanelEntry>(`${this.basePath()}/knowledge`)),
      );
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async addUrl(): Promise<void> {
    const content = this.url.trim();
    if (!content) return;
    await this.add(this.source('url', content));
    this.url = '';
  }

  async addText(): Promise<void> {
    const content = this.textContent.trim();
    if (!content) return;
    const title = this.textTitle.trim();
    await this.add({ ...this.source('text', content), ...(title ? { title } : {}) });
    this.textTitle = '';
    this.textContent = '';
  }

  /**
   * Both owners take the same source under a different field name: an agent
   * reads it from url or text, a chatbot from content.
   */
  private source(type: 'url' | 'text', content: string): Record<string, string> {
    return this.basePath().startsWith('/agents') ? { type, [type]: content } : { type, content };
  }

  async refresh(entry: KnowledgePanelEntry): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`${this.basePath()}/knowledge/${entry.id}/refresh`));
      this.notify.success('user.knowledge.refreshed');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(entry: KnowledgePanelEntry): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.knowledge.deleteTitle',
      messageKey: 'user.knowledge.deleteMessage',
      params: { title: this.label(entry) },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.delete(`${this.basePath()}/knowledge/${entry.id}`));
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  private async add(body: Record<string, string>): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.post(`${this.basePath()}/knowledge`, body));
      this.notify.success('user.knowledge.added');
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
