import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/**
 * How wide the screen is, as one answer the whole portal shares. A phone gets
 * the same shell and the same pages as a desk, but a table that needs eight
 * columns on a monitor is unreadable on a phone, so the pages ask here which
 * of their two column sets to show.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** True on a phone and on a tablet held upright, where the navigation slides over the page. */
  readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /**
   * The columns a table shows: the short set while the screen is narrow, the
   * full set otherwise. What the short set leaves out has to be readable in the
   * columns it keeps, so a page that drops a column moves its value under the
   * leading one rather than losing it.
   */
  columns(wide: readonly string[], narrow: readonly string[]): Signal<string[]> {
    return computed(() => [...(this.isHandset() ? narrow : wide)]);
  }
}
