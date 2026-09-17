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

export const PASSWORD_MIN_LENGTH = 10;

/**
 * The same common choices the back end refuses, so the hint appears while
 * typing instead of after sending. apps/api/src/auth/weak-password.ts is the
 * one that decides; this copy only saves the round trip.
 */
const COMMON_PASSWORDS = new Set([
  '0123456789',
  '1234567890',
  '12345678901',
  '123456789012',
  '1234567890123',
  '12345678910',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'qazwsxedc123',
  'zaq12wsxcde3',
  'qwertyuiop',
  'qwertzuiop',
  'azertyuiop',
  'qwerty12345',
  'qwerty123456',
  'qwertz123456',
  'azerty123456',
  'password123',
  'password1234',
  'password12345',
  'passw0rd123',
  'p@ssword123',
  'p@ssw0rd123',
  'passwort123',
  'passwort1234',
  'passwort2025',
  'passwort2026',
  'kennwort123',
  'motdepasse123',
  'administrator',
  'admin1234567',
  'admin123456',
  'changeme123',
  'changeit123',
  'letmein123',
  'letmein1234',
  'welcome123',
  'welcome1234',
  'willkommen123',
  'bonjour1234',
  'hallo123456',
  'geheim1234',
  'iloveyou123',
  'trustno1234',
  'sunshine123',
  'princess123',
  'superman123',
  'football123',
  'baseball123',
  'monkey12345',
  'dragon12345',
  'test1234567',
  'test123456',
  'demo123456',
  'portal1234',
  'echocall123',
]);

/** True when the whole password is one piece of at most four characters, repeated. */
function isRepeatedUnit(password: string): boolean {
  for (let size = 1; size <= 4 && size < password.length; size++) {
    if (password.length % size !== 0) continue;
    const unit = password.slice(0, size);
    if (unit.repeat(password.length / size) === password) return true;
  }
  return false;
}

/** Accepts anything the length rule has not already caught, except an obvious guess. */
export const passwordStrengthValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '')
    .trim()
    .toLowerCase();
  if (value.length < PASSWORD_MIN_LENGTH) return null;
  return COMMON_PASSWORDS.has(value) || isRepeatedUnit(value) ? { weakPassword: true } : null;
};
