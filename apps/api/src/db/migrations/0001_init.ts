import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { columnTypes } from '../column-types.js';
import type { DbDialect } from '../dialect.js';

export function init(dialect: DbDialect): Migration {
  const t = columnTypes(dialect);
  return {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('users')
        .addColumn('id', 'integer', t.id)
        .addColumn('email', 'varchar(255)', (c) => c.notNull().unique())
        .addColumn('password_hash', 'varchar(255)')
        .addColumn('role', 'varchar(16)', (c) => c.notNull())
        .addColumn('echocall_customer_id', 'integer', (c) => c.unique())
        .addColumn('first_name', 'varchar(100)')
        .addColumn('last_name', 'varchar(100)')
        .addColumn('language', 'varchar(2)', (c) => c.notNull().defaultTo('de'))
        .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('invited'))
        .addColumn('last_login_at', t.timestamp)
        .addColumn('created_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .addColumn('updated_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .execute();

      await db.schema
        .createTable('sessions')
        .addColumn('id', 'varchar(64)', (c) => c.primaryKey())
        .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
        .addColumn('expires_at', t.timestamp, (c) => c.notNull())
        .addColumn('created_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .addColumn('ip', 'varchar(45)')
        .addColumn('user_agent', 'varchar(300)')
        .execute();
      await db.schema.createIndex('sessions_user_idx').on('sessions').column('user_id').execute();

      await db.schema
        .createTable('one_time_tokens')
        .addColumn('id', 'integer', t.id)
        .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
        .addColumn('purpose', 'varchar(32)', (c) => c.notNull())
        .addColumn('token_hash', 'varchar(64)', (c) => c.notNull().unique())
        .addColumn('expires_at', t.timestamp, (c) => c.notNull())
        .addColumn('used_at', t.timestamp)
        .addColumn('created_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .execute();

      await db.schema
        .createTable('settings')
        .addColumn('key', 'varchar(64)', (c) => c.primaryKey())
        .addColumn('value', t.longText, (c) => c.notNull())
        .addColumn('updated_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .execute();

      await db.schema
        .createTable('audit_log')
        .addColumn('id', 'integer', t.id)
        .addColumn('actor_user_id', 'integer')
        .addColumn('action', 'varchar(64)', (c) => c.notNull())
        .addColumn('target_type', 'varchar(32)')
        .addColumn('target_id', 'varchar(64)')
        .addColumn('details', 'text')
        .addColumn('ip', 'varchar(45)')
        .addColumn('created_at', t.timestamp, (c) => c.notNull().defaultTo(t.now))
        .execute();
      await db.schema.createIndex('audit_log_created_idx').on('audit_log').column('created_at').execute();
    },
    async down(db: Kysely<any>) {
      for (const table of ['audit_log', 'settings', 'one_time_tokens', 'sessions', 'users']) {
        await db.schema.dropTable(table).ifExists().execute();
      }
    },
  };
}
