import type { Insertable } from 'kysely';
import type { Database } from './database.types.js';
import type { Db, DbDialect } from './dialect.js';

export type TableWithId = 'users' | 'oneTimeTokens' | 'auditLog';

/** MySQL has no RETURNING; PostgreSQL has no insertId. */
export async function insertReturningId<T extends TableWithId>(
  db: Db,
  dialect: DbDialect,
  table: T,
  values: Insertable<Database[T]>,
): Promise<number> {
  if (dialect === 'postgres') {
    const row = await db
      .insertInto(table)
      .values(values as any)
      .returning('id')
      .executeTakeFirstOrThrow();
    return Number((row as { id: number }).id);
  }
  const result = await db
    .insertInto(table)
    .values(values as any)
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}
