import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { TranslocoDirective } from '@jsverse/transloco';
import { AgentLanguageNames } from '../../../core/hub/agent-language-names.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** One line of the inventory, reduced to what a voice agent and a chatbot have in common. */
export interface AgentRow {
  id: number;
  name: string;
  language: string | null;
  createdAt: string | null;
  ownerId: number | null;
  ownerLabel: string;
}

/**
 * The inventory table. Voice agents and chatbots are stored apart but read the
 * same way, so both lists are drawn by this one table and differ only in the
 * rows and in the sentence shown when there are none.
 */
@Component({
  selector: 'app-agent-table',
  imports: [MatButtonModule, MatTableModule, TranslocoDirective, LocalDatePipe],
  template: `
    <ng-container *transloco="let t">
      <div class="table-wrap">
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.agents.name') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.agents.name')">
              {{ row.name }}
            </td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.agents.customer') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.agents.customer')">
              {{ row.ownerLabel || t('admin.agents.unknownCustomer') }}
            </td>
          </ng-container>
          <ng-container matColumnDef="language">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.agents.language') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.agents.language')">
              <span [attr.title]="languageName(row.language, true)">{{ languageName(row.language) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>{{ t('admin.agents.created') }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-label]="t('admin.agents.created')" class="nowrap">
              {{ row.createdAt | localDate }}
            </td>
          </ng-container>
          <ng-container matColumnDef="open">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row" class="cell-actions">
              @if (row.ownerId !== null) {
                <button
                  mat-button
                  type="button"
                  [title]="t('admin.agents.openHint')"
                  (click)="open.emit(row.ownerId)"
                  data-testid="open-owner"
                >
                  {{ t('admin.agents.open') }}
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty" [attr.colspan]="columns.length">{{ emptyText() }}</td>
          </tr>
        </table>
      </div>
    </ng-container>
  `,
  styles: `
    .cell-actions {
      text-align: right;
    }
  `,
})
export class AgentTableComponent {
  private readonly languageNames = inject(AgentLanguageNames);

  readonly rows = input.required<AgentRow[]>();
  readonly emptyText = input('');

  /** The customer whose workspace the operator asked to open. */
  readonly open = output<number>();

  readonly columns = ['name', 'customer', 'language', 'created', 'open'];

  /** The language of a row, named rather than left as the stored code. */
  languageName(code: string | null | undefined, english = false): string {
    return english ? this.languageNames.englishName(code) : this.languageNames.name(code);
  }
}
