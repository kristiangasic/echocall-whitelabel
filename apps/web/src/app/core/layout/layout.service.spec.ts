import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { LayoutService } from './layout.service';

const WIDE = ['customer', 'plan', 'price', 'status', 'actions'];
const NARROW = ['customer', 'status', 'actions'];

describe('LayoutService', () => {
  let matches: BehaviorSubject<{ matches: boolean }>;

  function create(handset: boolean) {
    matches = new BehaviorSubject({ matches: handset });
    TestBed.configureTestingModule({
      providers: [{ provide: BreakpointObserver, useValue: { observe: () => matches } }],
    });
    return TestBed.inject(LayoutService);
  }

  it('shows every column on a wide screen', () => {
    const layout = create(false);

    expect(layout.isHandset()).toBe(false);
    expect(layout.columns(WIDE, NARROW)()).toEqual(WIDE);
  });

  it('shows the short set on a phone', () => {
    const layout = create(true);

    expect(layout.isHandset()).toBe(true);
    expect(layout.columns(WIDE, NARROW)()).toEqual(NARROW);
  });

  it('follows the screen when it is turned', () => {
    const layout = create(false);
    const columns = layout.columns(WIDE, NARROW);
    expect(columns()).toEqual(WIDE);

    matches.next({ matches: true });

    expect(columns()).toEqual(NARROW);
  });
});
