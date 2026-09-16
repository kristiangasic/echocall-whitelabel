// The only place where the two dialects differ in DDL.
import { sql, type ColumnDefinitionBuilder } from 'kysely';
import type { DbDialect } from './dialect.js';

export function columnTypes(dialect: DbDialect) {
  const pg = dialect === 'postgres';
  return {
    /** Auto-incrementing integer primary key. Use with data type 'integer'. */
    id: (c: ColumnDefinitionBuilder) =>
      pg ? c.primaryKey().generatedAlwaysAsIdentity() : c.primaryKey().autoIncrement(),
    timestamp: pg ? sql`timestamptz` : sql`datetime(3)`,
    now: pg ? sql`now()` : sql`CURRENT_TIMESTAMP(3)`,
    /** For documents that may exceed 64 KB (branding with a logo data URL). */
    longText: pg ? sql`text` : sql`mediumtext`,
  };
}
