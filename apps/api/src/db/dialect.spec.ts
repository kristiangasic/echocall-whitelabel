import { describe, expect, it } from 'vitest';
import { createKyselyDialect, detectDialect } from './dialect.js';

describe('detectDialect', () => {
  it('maps every supported scheme', () => {
    expect(detectDialect('postgres://u:p@h/d')).toBe('postgres');
    expect(detectDialect('postgresql://u:p@h/d')).toBe('postgres');
    expect(detectDialect('mysql://u:p@h/d')).toBe('mysql');
    expect(detectDialect('MariaDB://u:p@h/d')).toBe('mysql');
  });

  it('rejects unknown schemes with a readable message', () => {
    expect(() => detectDialect('sqlite://file.db')).toThrow(/DATABASE_URL must start with .*got "sqlite"/);
  });
});

describe('createKyselyDialect', () => {
  // Pools connect lazily, so building a dialect never opens a socket.
  it('builds a MySQL dialect from a mariadb URL with an encoded password', () => {
    const { dialect, kyselyDialect } = createKyselyDialect('mariadb://u:p%40ss@h:3307/d', 'disable');
    expect(dialect).toBe('mysql');
    expect(kyselyDialect.createAdapter().supportsReturning).toBe(false);
  });

  it('builds a PostgreSQL dialect for every ssl mode', () => {
    for (const ssl of ['disable', 'require', 'no-verify'] as const) {
      const { dialect, kyselyDialect } = createKyselyDialect('postgres://u:p@h:5433/d', ssl);
      expect(dialect).toBe('postgres');
      expect(kyselyDialect.createAdapter().supportsReturning).toBe(true);
    }
  });
});
