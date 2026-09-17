import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BarListComponent, type BarItem } from './bar-list.component';

@Component({
  imports: [BarListComponent],
  template: `<app-bar-list [items]="items()" [emptyText]="'Nothing to show'" />`,
})
class Host {
  readonly items = signal<BarItem[]>([]);
}

describe('BarListComponent', () => {
  async function render(items: BarItem[]) {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.items.set(items);
    await fixture.whenStable();
    return fixture;
  }

  it('scales every bar against the largest value', async () => {
    const fixture = await render([
      { label: 'Mon', value: 5 },
      { label: 'Tue', value: 10 },
    ]);

    const fills = fixture.nativeElement.querySelectorAll('.fill');
    expect(fills[0].style.width).toBe('50%');
    expect(fills[1].style.width).toBe('100%');
  });

  it('draws no bar when every value is zero', async () => {
    const fixture = await render([{ label: 'Mon', value: 0 }]);

    expect(fixture.nativeElement.querySelector('.fill').style.width).toBe('0%');
  });

  it('shows the caption instead of the raw value when given', async () => {
    const fixture = await render([{ label: 'Mon', value: 90, caption: '1:30' }]);

    expect(fixture.nativeElement.querySelector('.value').textContent.trim()).toBe('1:30');
  });

  it('falls back to the empty text', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.textContent).toContain('Nothing to show');
  });
});
