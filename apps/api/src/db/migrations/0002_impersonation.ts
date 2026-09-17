import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Remembers which administrator opened a session as one of their customers.
 *
 * Deliberately a plain column without a foreign key: when the administrator
 * account is deleted, the session must still know that it does not belong to
 * the customer alone, so that going back ends the session instead of switching
 * into an account that no longer exists.
 */
export function impersonation(): Migration {
  return {
    async up(db: Kysely<any>) {
      await db.schema.alterTable('sessions').addColumn('impersonator_id', 'integer').execute();
    },
    async down(db: Kysely<any>) {
      await db.schema.alterTable('sessions').dropColumn('impersonator_id').execute();
    },
  };
}
