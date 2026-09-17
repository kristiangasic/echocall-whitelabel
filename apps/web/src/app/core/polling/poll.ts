import type { DestroyRef } from '@angular/core';

/**
 * Runs `tick` on an interval for as long as the owning component lives and the
 * tab is visible. A hidden tab stops the timer instead of piling up requests,
 * and the first tick after it becomes visible again runs at once. Ticks never
 * overlap: a slow tick delays the next one rather than stacking.
 *
 * The DestroyRef is passed in rather than injected, so this can be called from
 * ngOnInit, which is not an injection context.
 */
export function startPolling(
  destroyRef: DestroyRef,
  intervalMs: number,
  tick: () => Promise<void> | void,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let stopped = false;

  const run = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  };

  const start = (): void => {
    if (timer !== null || stopped) return;
    timer = setInterval(() => void run(), intervalMs);
  };

  const pause = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      start();
      void run();
    } else {
      pause();
    }
  };

  const stop = (): void => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (document.visibilityState === 'visible') start();
  destroyRef.onDestroy(stop);
  return stop;
}
