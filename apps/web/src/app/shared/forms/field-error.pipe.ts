import { Pipe, type PipeTransform } from '@angular/core';
import type { AbstractControl } from '@angular/forms';

export interface FieldError {
  key: string;
  params?: Record<string, unknown>;
}

const SIMPLE: Record<string, string> = {
  required: 'validation.required',
  email: 'validation.email',
  mismatch: 'validation.passwordMismatch',
  hexColor: 'validation.hexColor',
  url: 'validation.url',
  integer: 'validation.integer',
  positiveInteger: 'validation.positiveInteger',
  phoneNumber: 'validation.phoneNumber',
  min: 'validation.positiveAmount',
};

/** First error of a control as a translation key; impure because control state is not a signal. */
export function firstFieldError(control: AbstractControl | null | undefined): FieldError | null {
  const errors = control?.errors;
  if (!errors) return null;
  for (const [name, detail] of Object.entries(errors)) {
    if (name in SIMPLE) return { key: SIMPLE[name] };
    if (name === 'minlength')
      return { key: 'validation.minLength', params: { count: detail.requiredLength } };
    if (name === 'maxlength')
      return { key: 'validation.maxLength', params: { count: detail.requiredLength } };
    if (name === 'server') return { key: 'validation.server', params: { message: detail } };
  }
  return { key: 'validation.invalid' };
}

@Pipe({ name: 'fieldError', pure: false })
export class FieldErrorPipe implements PipeTransform {
  transform(control: AbstractControl | null | undefined): FieldError | null {
    return firstFieldError(control);
  }
}
