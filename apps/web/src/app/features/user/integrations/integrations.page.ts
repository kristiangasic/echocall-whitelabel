import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HubService } from '../../../core/hub/hub.service';
import type { IntegrationSummary, IntegrationType } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../../../shared/confirm-dialog.component';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { IntegrationDialogComponent, type IntegrationDialogData } from './integration-dialog.component';
import {
  IntegrationToolsDialogComponent,
  type IntegrationToolsDialogData,
} from './integration-tools-dialog.component';

/** What a connector reports back from a test call; every connector answers differently. */
interface TestResult {
  success?: boolean;
  message?: string;
}

/**
 * The services this account has connected, and the catalog of what else can
 * be connected. Which tools an assistant may actually call is decided in the
 * agent and chatbot editors, not here.
 */
@Component({
  selector: 'app-integrations-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    TranslocoDirective,
    LocalDatePipe,
  ],
  providers: [provideTranslocoScope('user')],
  template: `
    <ng-container *transloco="let t">
      <div class="page-head">
        <h1 class="page-title">{{ t('user.integrations.title') }}</h1>
        <button mat-flat-button type="button" (click)="connect()" data-testid="integrations-connect">
          <mat-icon>add</mat-icon>
          {{ t('user.integrations.connect') }}
        </button>
      </div>
      <p class="hint">{{ t('user.integrations.hint') }}</p>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="table-wrap">
        <table mat-table [dataSource]="integrations()" data-testid="integrations-table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.integrations.name') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.integrations.name')">
              <strong>{{ row.name }}</strong>
              <span class="sub">{{ typeName(row.type) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ t('fields.status') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('fields.status')">
              <mat-chip-set>
                <mat-chip [highlighted]="row.isActive">
                  {{ t(row.isActive ? 'user.integrations.active' : 'user.integrations.inactive') }}
                </mat-chip>
              </mat-chip-set>
            </td>
          </ng-container>
          <ng-container matColumnDef="lastUsed">
            <th mat-header-cell *matHeaderCellDef>{{ t('user.integrations.lastUsed') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('user.integrations.lastUsed')">
              {{ row.lastUsedAt ? (row.lastUsedAt | localDate: 'short') : t('user.integrations.never') }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="row-actions">
              <button
                mat-icon-button
                type="button"
                (click)="test(row)"
                [disabled]="busy()"
                [matTooltip]="t('user.integrations.test')"
                [attr.aria-label]="t('user.integrations.test')"
                [attr.data-testid]="'integration-test-' + row.id"
              >
                <mat-icon>bolt</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="showTools(row)"
                [matTooltip]="t('user.integrations.tools')"
                [attr.aria-label]="t('user.integrations.tools')"
              >
                <mat-icon>handyman</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="edit(row)"
                [matTooltip]="t('actions.edit')"
                [attr.aria-label]="t('actions.edit')"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="remove(row)"
                [matTooltip]="t('actions.delete')"
                [attr.aria-label]="t('actions.delete')"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">
              {{ t('user.integrations.empty') }}
            </td>
          </tr>
        </table>
      </div>

      <h2 class="section-title catalog-title">{{ t('user.integrations.catalog') }}</h2>
      <div class="catalog" data-testid="integrations-catalog">
        @for (entry of catalog(); track entry.type) {
          <mat-card appearance="outlined">
            <mat-card-content>
              <strong>{{ entry.name }}</strong>
              @if (entry.category) {
                <span class="sub">{{ categoryLabel(entry.category) }}</span>
              }
              <p class="description">{{ entry.description }}</p>
            </mat-card-content>
            <mat-card-actions>
              <button
                mat-button
                type="button"
                (click)="connect(entry.type)"
                [attr.data-testid]="'catalog-' + entry.type"
              >
                {{ t('user.integrations.connect') }}
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    </ng-container>
  `,
  styles: `
    table {
      width: 100%;
    }
    .sub {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .row-actions {
      white-space: nowrap;
      text-align: right;
    }
    .empty,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .catalog-title {
      margin: 32px 0 12px;
    }
    /* A fixed column count per width: the cards keep their alignment down the
       gallery instead of resizing with every entry the service adds. */
    .catalog {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      align-items: stretch;
    }
    .catalog mat-card {
      display: flex;
      flex-direction: column;
    }
    .catalog mat-card-actions {
      margin-top: auto;
    }
    @media (max-width: 1299px) {
      .catalog {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @media (max-width: 899px) {
      .catalog {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 599px) {
      .catalog {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .description {
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class IntegrationsPage implements OnInit {
  private readonly hub = inject(HubService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly transloco = inject(TranslocoService);

  readonly integrations = signal<IntegrationSummary[]>([]);
  readonly catalog = signal<IntegrationType[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly columns = ['name', 'status', 'lastUsed', 'actions'];

  private readonly byType = computed(() => new Map(this.catalog().map((entry) => [entry.type, entry.name])));

  ngOnInit(): void {
    void this.load();
  }

  /**
   * Names a catalog category in the reader's language, falling back to the
   * word the service sent when it offers a category the portal has no name
   * for yet: a raw word reads better than an empty slot or a key.
   */
  categoryLabel(category: string): string {
    const key = `user.integrations.categories.${category}`;
    const label = this.transloco.translate(key);
    return label === key ? category : label;
  }

  /** The catalog name of a type, or the raw value when the catalog does not list it. */
  typeName(type: string): string {
    return this.byType().get(type) ?? type;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [integrations, catalog] = await Promise.all([
        firstValueFrom(this.hub.get<IntegrationSummary[]>('/integrations')),
        firstValueFrom(this.hub.get<IntegrationType[]>('/integrations/types')),
      ]);
      this.integrations.set(integrations);
      this.catalog.set(catalog);
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }

  async connect(type?: string): Promise<void> {
    const data: IntegrationDialogData = { types: this.catalog(), ...(type ? { type } : {}) };
    const saved = await firstValueFrom(this.dialog.open(IntegrationDialogComponent, { data }).afterClosed());
    if (saved) await this.load();
  }

  async edit(integration: IntegrationSummary): Promise<void> {
    const data: IntegrationDialogData = { types: this.catalog(), integrationId: integration.id };
    const saved = await firstValueFrom(this.dialog.open(IntegrationDialogComponent, { data }).afterClosed());
    if (saved) await this.load();
  }

  showTools(integration: IntegrationSummary): void {
    const data: IntegrationToolsDialogData = { integrationId: integration.id, name: integration.name };
    this.dialog.open(IntegrationToolsDialogComponent, { data });
  }

  async test(integration: IntegrationSummary): Promise<void> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.hub.post<TestResult>(`/integrations/${integration.id}/test`));
      if (result.success === false) this.notify.error('user.integrations.testFailed');
      else this.notify.success('user.integrations.testOk');
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(integration: IntegrationSummary): Promise<void> {
    const data: ConfirmDialogData = {
      titleKey: 'user.integrations.deleteTitle',
      messageKey: 'user.integrations.deleteMessage',
      params: { name: integration.name },
      confirmKey: 'actions.delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data }).afterClosed());
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.hub.delete(`/integrations/${integration.id}`));
      await this.load();
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}
