import type { Migration } from 'kysely/migration';
import type { DbDialect } from '../dialect.js';
import { init } from './0001_init.js';

/** Ordered by key; the migrator applies them alphabetically. */
export function createMigrations(dialect: DbDialect): Record<string, Migration> {
  return { '0001_init': init(dialect) };
}
