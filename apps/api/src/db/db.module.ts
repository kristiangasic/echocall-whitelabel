import { Global, Module } from '@nestjs/common';
import { DB, DB_DIALECT, DbService } from './db.service.js';

// The pool connects lazily; the first real connection happens during the
// migration in DbService.onModuleInit, so DB and DB_DIALECT can be read from the service.
@Global()
@Module({
  providers: [
    DbService,
    { provide: DB, useFactory: (s: DbService) => s.db, inject: [DbService] },
    { provide: DB_DIALECT, useFactory: (s: DbService) => s.dialect, inject: [DbService] },
  ],
  exports: [DB, DB_DIALECT, DbService],
})
export class DbModule {}
