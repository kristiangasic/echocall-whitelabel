import type { ComponentFixture } from '@angular/core/testing';

export function byTestId<T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<unknown>,
  id: string,
): T {
  const element = (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`No element with data-testid="${id}"`);
  return element;
}

/** Types into an input the way a person would, so the reactive form picks the value up. */
export function type(fixture: ComponentFixture<unknown>, id: string, value: string): void {
  const input = byTestId<HTMLInputElement>(fixture, id);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

export function submit(fixture: ComponentFixture<unknown>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form');
  if (!form) throw new Error('No form rendered');
  form.dispatchEvent(new Event('submit', { bubbles: true }));
}
