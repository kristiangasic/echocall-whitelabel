import type { ValidatorFn } from '@angular/forms';

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

/**
 * Accepts an empty value or a number in international notation. Telephony
 * takes nothing else, and finding that out from the carrier costs a round
 * trip and a confusing message.
 */
export const phoneNumberValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '').trim();
  if (value === '') return null;
  return /^\+[1-9]\d{6,14}$/.test(value) ? null : { phoneNumber: true };
};

/** Accepts an empty value or a whole number above zero. For identifiers. */
export const integerValidator: ValidatorFn = (control) => {
  const value = control.value;
  if (value === '' || value === null || value === undefined) return null;
  return /^\d+$/.test(String(value)) && Number(value) > 0 ? null : { positiveInteger: true };
};

/**
 * Accepts an empty value or a whole number from zero up. Allowances need the
 * zero: a plan that includes none of a service says so with a zero, while an
 * empty field means no limit at all.
 */
export const allowanceValidator: ValidatorFn = (control) => {
  const value = control.value;
  if (value === '' || value === null || value === undefined) return null;
  return /^\d+$/.test(String(value)) ? null : { integer: true };
};
