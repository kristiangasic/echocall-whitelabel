import { type Kysely, sql } from 'kysely';
import type { Migration } from 'kysely/migration';
import { columnTypes } from '../column-types.js';
import type { DbDialect } from '../dialect.js';

/**
 * The portal stops holding passwords.
 *
 * A mailed link is now the only way in, so the stored hashes are not merely
 * unused, they are a liability nobody needs: they go, and with them any chance
 * that an old dump still holds someone's password. What the hash also told the
 * portal, whether an invitation had ever been accepted, moves into a date of
 * its own, which says the same thing and reads better in an audit.
 *
 * Going back is possible but lossy: down() puts the empty column back, and
 * everyone signs in by link until they are invited again.
 */
export function passwordless(dialect: DbDialect): Migration {
  const t = columnTypes(dialect);
  return {
    async up(db: Kysely<any>) {
      await db.schema.alterTable('users').addColumn('accepted_at', t.timestamp).execute();
      // Anyone who had a password had accepted their invitation. The exact
      // moment is gone, so the account's own dates stand in for it.
      await sql`update users set accepted_at = coalesce(last_login_at, updated_at, created_at) where password_hash is not null`.execute(
        db,
      );
      await db.schema.alterTable('users').dropColumn('password_hash').execute();
      await sql`delete from one_time_tokens where purpose = 'password_reset'`.execute(db);
    },
    async down(db: Kysely<any>) {
      await db.schema.alterTable('users').addColumn('password_hash', 'varchar(255)').execute();
      await db.schema.alterTable('users').dropColumn('accepted_at').execute();
    },
  };
}
