import type { Migration } from 'kysely/migration';
import type { DbDialect } from '../dialect.js';
import { init } from './0001_init.js';
import { impersonation } from './0002_impersonation.js';
import { twoFactor } from './0003_two_factor.js';
import { passwordless } from './0004_passwordless.js';

/** Ordered by key; the migrator applies them alphabetically. */
export function createMigrations(dialect: DbDialect): Record<string, Migration> {
  return {
    '0001_init': init(dialect),
    '0002_impersonation': impersonation(),
    '0003_two_factor': twoFactor(dialect),
    '0004_passwordless': passwordless(dialect),
  };
}
