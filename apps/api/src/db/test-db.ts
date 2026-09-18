import { sql } from 'kysely';
import { createDb, type Db, type DbDialect } from './dialect.js';
import { migrateToLatest } from './migrator.js';

const TABLES = ['audit_log', 'one_time_tokens', 'two_factor_recovery_codes', 'sessions', 'settings', 'users'];

export interface TestDb {
  db: Db;
  dialect: DbDialect;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Connects to TEST_DATABASE_URL, migrates, and empties every table.
 * Spec files run one after another (vitest.config.ts: fileParallelism false), so they may share the schema.
 */
export async function createTestDb(): Promise<TestDb> {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/echocall_light_test';
  const { db, dialect } = createDb(url, 'disable');
  await migrateToLatest(db, dialect);
  const reset = async (): Promise<void> => {
    if (dialect === 'postgres') {
      await sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`).execute(db);
    } else {
      await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
      for (const table of TABLES) await sql.raw(`TRUNCATE TABLE ${table}`).execute(db);
      await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
    }
  };
  await reset();
  return { db, dialect, reset, close: () => db.destroy() };
}
