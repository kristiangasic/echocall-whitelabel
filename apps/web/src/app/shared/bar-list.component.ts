import { Component, computed, input } from '@angular/core';

/** One row of the bar list: a label, the value the bar is drawn from, and an optional note. */
export interface BarItem {
  label: string;
  value: number;
  caption?: string;
}

/**
 * A plain bar chart built from divs. The widest bar is the largest value in
 * the set, so the rows stay comparable without a charting library, and the
 * figures are readable on their own when the bars do not render.
 */
@Component({
  selector: 'app-bar-list',
  template: `
    <ul class="bars" data-testid="bar-list">
      @for (item of items(); track item.label) {
        <li>
          <span class="label">{{ item.label }}</span>
          <span class="track">
            <span class="fill" [style.width.%]="width(item.value)"></span>
          </span>
          <span class="value">{{ item.caption ?? item.value }}</span>
        </li>
      } @empty {
        <li class="empty">{{ emptyText() }}</li>
      }
    </ul>
  `,
  styles: `
    .bars {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    li {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(0, 3fr) auto;
      gap: 12px;
      align-items: center;
    }
    li.empty {
      display: block;
      color: var(--mat-sys-on-surface-variant);
    }
    .label {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .track {
      background: var(--mat-sys-surface-container-high);
      border-radius: 4px;
      height: 12px;
      overflow: hidden;
    }
    .fill {
      display: block;
      height: 100%;
      min-width: 2px;
      background: var(--mat-sys-primary);
      border-radius: 4px;
    }
    .value {
      font-variant-numeric: tabular-nums;
      font: var(--mat-sys-body-small);
    }
  `,
})
export class BarListComponent {
  readonly items = input.required<BarItem[]>();
  readonly emptyText = input('');

  private readonly max = computed(() => Math.max(...this.items().map((item) => item.value), 0));

  width(value: number): number {
    const max = this.max();
    if (max <= 0) return 0;
    return Math.round((value / max) * 100);
  }
}
