/**
 * Ten characters keep a password out of reach of a quick guess, but they do not
 * help when the ten characters are the ones everyone picks first. Two small
 * checks close that gap: a list of the common choices that survive the length
 * rule, and a test for a password that is one short piece written over and over.
 * Everything else is left to the length, which is what carries the strength.
 *
 * The web front end mirrors these rules in shared/forms/validators.ts so the
 * hint appears while typing; this file stays the one that decides.
 */

/** Common choices with at least ten characters, lower case, in the three portal languages. */
const COMMON = new Set([
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

/** True when a password passes the length rule but is still an obvious guess. */
export function isWeakPassword(password: string): boolean {
  const normalised = password.trim().toLowerCase();
  return COMMON.has(normalised) || isRepeatedUnit(normalised);
}
