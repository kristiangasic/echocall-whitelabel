import { CamelCasePlugin, Kysely, MysqlDialect, PostgresDialect, type Dialect } from 'kysely';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import type { DbSslMode } from '../config/env.js';
import type { Database } from './database.types.js';

export type DbDialect = 'postgres' | 'mysql';
export type Db = Kysely<Database>;

const POOL_SIZE = 10;

export function detectDialect(url: string): DbDialect {
  const scheme = url.split(':')[0]?.toLowerCase();
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgres';
  if (scheme === 'mysql' || scheme === 'mariadb') return 'mysql';
  throw new Error(
    `DATABASE_URL must start with postgres://, postgresql://, mysql:// or mariadb:// (got "${scheme ?? ''}")`,
  );
}

/** Builds the Kysely dialect for the connection URL. Pools connect lazily on first use. */
export function createKyselyDialect(
  url: string,
  ssl: DbSslMode,
): { dialect: DbDialect; kyselyDialect: Dialect } {
  const dialect = detectDialect(url);
  if (dialect === 'postgres') {
    const sslOption = ssl === 'disable' ? false : ssl === 'require' ? true : { rejectUnauthorized: false };
    const pool = new Pool({ connectionString: url, ssl: sslOption, max: POOL_SIZE });
    return { dialect, kyselyDialect: new PostgresDialect({ pool }) };
  }
  const u = new URL(url.replace(/^mariadb:/i, 'mysql:'));
  const pool = createPool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: POOL_SIZE,
    timezone: 'Z',
    ...(ssl === 'disable' ? {} : { ssl: ssl === 'require' ? {} : { rejectUnauthorized: false } }),
  });
  return { dialect, kyselyDialect: new MysqlDialect({ pool }) };
}

export function createDb(url: string, ssl: DbSslMode): { db: Db; dialect: DbDialect } {
  const { dialect, kyselyDialect } = createKyselyDialect(url, ssl);
  return { dialect, db: new Kysely<Database>({ dialect: kyselyDialect, plugins: [new CamelCasePlugin()] }) };
}
