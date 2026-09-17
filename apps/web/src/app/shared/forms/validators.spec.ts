import { describe, it, expect } from 'vitest';
import { FormControl } from '@angular/forms';
import { allowanceValidator, integerValidator, passwordStrengthValidator } from './validators';

const check = (validator: typeof integerValidator, value: string) => validator(new FormControl(value));

describe('integerValidator', () => {
  it('accepts a whole number above zero and an empty field', () => {
    expect(check(integerValidator, '141453')).toBeNull();
    expect(check(integerValidator, '')).toBeNull();
  });

  it('refuses zero, a fraction and anything that is not a number', () => {
    // This one guards identifiers, where a zero points at no record at all.
    expect(check(integerValidator, '0')).toEqual({ positiveInteger: true });
    expect(check(integerValidator, '1.5')).toEqual({ positiveInteger: true });
    expect(check(integerValidator, 'zwölf')).toEqual({ positiveInteger: true });
  });
});

describe('allowanceValidator', () => {
  it('accepts zero, because a plan may include none of a service', () => {
    expect(check(allowanceValidator, '0')).toBeNull();
    expect(check(allowanceValidator, '300')).toBeNull();
  });

  it('accepts an empty field, which stands for no limit at all', () => {
    expect(check(allowanceValidator, '')).toBeNull();
  });

  it('refuses a negative number, a fraction and anything that is not a number', () => {
    expect(check(allowanceValidator, '-1')).toEqual({ integer: true });
    expect(check(allowanceValidator, '2.5')).toEqual({ integer: true });
    expect(check(allowanceValidator, 'viele')).toEqual({ integer: true });
  });
});

describe('passwordStrengthValidator', () => {
  it('accepts a password that is long and not one of the usual guesses', () => {
    expect(check(passwordStrengthValidator, 'ada zaehlt schafe')).toBeNull();
  });

  it('refuses the common choices that survive the length rule', () => {
    expect(check(passwordStrengthValidator, 'passwort123')).toEqual({ weakPassword: true });
    expect(check(passwordStrengthValidator, 'Password123')).toEqual({ weakPassword: true });
    expect(check(passwordStrengthValidator, 'qwertzuiop')).toEqual({ weakPassword: true });
  });

  it('refuses one short piece written over and over', () => {
    expect(check(passwordStrengthValidator, 'abcabcabcabc')).toEqual({ weakPassword: true });
    expect(check(passwordStrengthValidator, 'aaaaaaaaaaaa')).toEqual({ weakPassword: true });
  });

  it('leaves a short password to the length rule, which already has it', () => {
    expect(check(passwordStrengthValidator, 'abc')).toBeNull();
    expect(check(passwordStrengthValidator, '')).toBeNull();
  });
});
