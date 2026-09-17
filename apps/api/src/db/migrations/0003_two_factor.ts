import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { columnTypes } from '../column-types.js';
import type { DbDialect } from '../dialect.js';

/**
 * The second factor of a login.
 *
 * The secret is stored as the same encrypted envelope the SMTP password uses,
 * so a database dump alone does not hand out anyone's codes. It is written
 * before it is proven: an enrolment that is never finished leaves a secret
 * with no confirmation date, and a login only asks for a code once that date
 * is set. Recovery codes live in their own table because each one is used at
 * most once and a used code stays visible as a used one.
 */
export function twoFactor(dialect: DbDialect): Migration {
  const t = columnTypes(dialect);
  return {
    async up(db: Kysely<any>) {
      await db.schema.alterTable('users').addColumn('totp_secret', 'varchar(255)').execute();
      await db.schema.alterTable('users').addColumn('totp_confirmed_at', t.timestamp).execute();

      await db.schema
        .createTable('two_factor_recovery_codes')
        .addColumn('id', 'integer', t.id)
        .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
        .addColumn('code_hash', 'varchar(255)', (c) => c.notNull())
        .addColumn('used_at', t.timestamp)
        .addColumn('created_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .execute();
      await db.schema
        .createIndex('two_factor_recovery_user_idx')
        .on('two_factor_recovery_codes')
        .column('user_id')
        .execute();
    },
    async down(db: Kysely<any>) {
      await db.schema.dropTable('two_factor_recovery_codes').execute();
      await db.schema.alterTable('users').dropColumn('totp_confirmed_at').execute();
      await db.schema.alterTable('users').dropColumn('totp_secret').execute();
    },
  };
}
