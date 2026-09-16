import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import type { DbDialect } from './dialect.js';
import { createMigrations } from './migrations/index.js';

/** Applies every pending migration and returns the names that were applied. Throws on failure. */
export async function migrateToLatest(db: Kysely<any>, dialect: DbDialect): Promise<string[]> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => createMigrations(dialect) } });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}
