import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { startPolling } from './poll';

@Component({ template: '' })
class PollingHost {
  readonly ticks: number[] = [];
  readonly stop = startPolling(inject(DestroyRef), 10, () => {
    this.ticks.push(Date.now());
  });
}

describe('startPolling', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [PollingHost] });
    return TestBed.createComponent(PollingHost);
  }

  it('ticks on the interval while the component lives', async () => {
    const fixture = create();
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(fixture.componentInstance.ticks.length).toBeGreaterThan(1);
    fixture.componentInstance.stop();
  });

  it('stops ticking once the component is destroyed', async () => {
    const fixture = create();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const seen = fixture.componentInstance.ticks.length;
    expect(seen).toBeGreaterThan(0);

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fixture.componentInstance.ticks.length).toBe(seen);
  });

  it('never runs two ticks at the same time', async () => {
    let running = 0;
    let overlaps = 0;
    const fixture = create();
    const stop = startPolling(TestBed.inject(DestroyRef), 5, async () => {
      running += 1;
      if (running > 1) overlaps += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();
    fixture.componentInstance.stop();
    expect(overlaps).toBe(0);
  });
});
