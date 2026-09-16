import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Group validator: marks `confirmKey` with `mismatch` while it differs from `passwordKey`. */
export function matchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey);
    const confirm = group.get(confirmKey);
    if (!password || !confirm) return null;
    const others = { ...confirm.errors };
    delete others['mismatch'];
    const mismatch = confirm.value !== '' && confirm.value !== password.value;
    const errors = mismatch ? { ...others, mismatch: true } : others;
    confirm.setErrors(Object.keys(errors).length ? errors : null);
    return null;
  };
}

export const hexColorValidator: ValidatorFn = (control) =>
  control.value === '' || /^#[0-9a-fA-F]{6}$/.test(String(control.value)) ? null : { hexColor: true };

/** Accepts an empty value or an absolute http(s) address. */
export const urlValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '').trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? null : { url: true };
  } catch {
    return { url: true };
  }
};

export const integerValidator: ValidatorFn = (control) => {
  const value = control.value;
  if (value === '' || value === null || value === undefined) return null;
  return /^\d+$/.test(String(value)) && Number(value) > 0 ? null : { integer: true };
};

export const PASSWORD_MIN_LENGTH = 10;
