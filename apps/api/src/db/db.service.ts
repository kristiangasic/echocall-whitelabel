import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { createDb, type Db, type DbDialect } from './dialect.js';
import { migrateToLatest } from './migrator.js';

export const DB = Symbol('DB');
export const DB_DIALECT = Symbol('DB_DIALECT');

/** Owns the connection pool; migrates on start and closes the pool on shutdown. */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly db: Db;
  readonly dialect: DbDialect;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const created = createDb(config.database.url, config.database.ssl);
    this.db = created.db;
    this.dialect = created.dialect;
  }

  async onModuleInit(): Promise<void> {
    const applied = await migrateToLatest(this.db, this.dialect);
    this.logger.log(
      applied.length
        ? `Applied migrations: ${applied.join(', ')}`
        : `Database schema is up to date (${this.dialect})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
