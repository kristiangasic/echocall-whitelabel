import { ADMIN_TEXTS } from '../../../testing/i18n';
import { auditAction, auditDetails } from './audit-entry';

/** The portal's own English texts, reached the way Transloco reaches them. */
function t(key: string): string {
  let node: unknown = ADMIN_TEXTS;
  for (const part of key.replace(/^admin\./, '').split('.')) {
    if (node === null || typeof node !== 'object') return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

describe('auditAction', () => {
  it('names a recorded action in the words of the portal', () => {
    expect(auditAction('users.invited', t)).toBe(ADMIN_TEXTS.audit.actions.users_invited);
  });

  it('keeps an action the portal has no wording for', () => {
    expect(auditAction('something.odd', t)).toBe('something.odd');
  });
});

describe('auditDetails', () => {
  it('reads a payload as labelled values', () => {
    expect(auditDetails({ email: 'someone@example.com', role: 'user' }, t)).toBe(
      'E-mail: someone@example.com · Role: user',
    );
  });

  it('says yes and no rather than true and false', () => {
    expect(auditDetails({ mailSent: true }, t)).toBe('Mail sent: Yes');
    expect(auditDetails({ mailSent: false }, t)).toBe('Mail sent: No');
  });

  it('names the fields a change touched', () => {
    expect(auditDetails({ changed: ['firstName', 'role'] }, t)).toBe('Changed: First name, Role');
  });

  it('spells out a field the portal has no name for', () => {
    expect(auditDetails({ defaultPlanId: 4 }, t)).toBe('Default plan id: 4');
  });

  it('leaves out what was not recorded', () => {
    expect(auditDetails({ email: 'someone@example.com', reason: null }, t)).toBe(
      'E-mail: someone@example.com',
    );
  });

  it('has nothing to say about an entry that carried no payload', () => {
    expect(auditDetails(null, t)).toBe('');
  });
});
