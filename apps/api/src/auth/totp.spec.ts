import { describe, expect, it } from 'vitest';
import { generateSecret, otpauthUrl, STEP_SECONDS, totpCode, verifyTotp } from './totp.js';

// RFC 6238, appendix B. The document prints eight digits for the ASCII secret
// "12345678901234567890"; a six digit authenticator shows its last six.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('totpCode', () => {
  it('matches the published test vectors', () => {
    for (const [seconds, expected] of VECTORS) {
      expect(totpCode(RFC_SECRET, seconds * 1000), String(seconds)).toBe(expected);
    }
  });

  it('keeps the same code for a whole step and changes at its edge', () => {
    const start = 1_600_000_020_000;
    expect(totpCode(RFC_SECRET, start)).toBe(totpCode(RFC_SECRET, start + 29_000));
    expect(totpCode(RFC_SECRET, start)).not.toBe(totpCode(RFC_SECRET, start + 30_000));
  });
});

describe('verifyTotp', () => {
  const now = 1_600_000_000_000;

  it('accepts the current code', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(true);
  });

  // A phone whose clock runs a little fast or slow, and a person who starts
  // typing just before the code rolls over, both land one step away.
  it('accepts one step in each direction and refuses two', () => {
    const step = STEP_SECONDS * 1000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - step), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + step), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 2 * step), now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 2 * step), now)).toBe(false);
  });

  it('refuses what a tired person types, without throwing', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '  ', '12 34 56']) {
      expect(verifyTotp(RFC_SECRET, code, now), JSON.stringify(code)).toBe(false);
    }
  });

  it('reads a code the way an authenticator shows it, with a space in the middle', () => {
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });
});

describe('generateSecret', () => {
  it('returns a fresh base32 secret without padding', () => {
    const first = generateSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(first).not.toBe(generateSecret());
  });

  it('produces a secret the code path can use', () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, totpCode(secret, 1_600_000_000_000), 1_600_000_000_000)).toBe(true);
  });
});

describe('otpauthUrl', () => {
  it('names the portal and the account, escaping what needs it', () => {
    const url = otpauthUrl({
      secret: RFC_SECRET,
      account: 'lena@example.test',
      issuer: 'Nordwind Telefonie',
    });
    expect(url).toBe(
      'otpauth://totp/Nordwind%20Telefonie:lena%40example.test' +
        `?secret=${RFC_SECRET}&issuer=Nordwind%20Telefonie&algorithm=SHA1&digits=6&period=30`,
    );
  });
});
