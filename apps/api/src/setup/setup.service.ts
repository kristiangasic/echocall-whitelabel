import { Inject, Injectable } from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { apiError } from '../common/http-error.js';
import type { UserRow } from '../db/database.types.js';
import { DB, DB_DIALECT } from '../db/db.service.js';
import type { Db, DbDialect } from '../db/dialect.js';
import { insertReturningId } from '../db/helpers.js';
import type { SetupAdminDto } from './dto.js';

@Injectable()
export class SetupService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_DIALECT) private readonly dialect: DbDialect,
    private readonly passwords: PasswordService,
  ) {}

  /** True until the first administrator account exists. */
  async needsAdmin(): Promise<boolean> {
    const admin = await this.db
      .selectFrom('users')
      .select('id')
      .where('role', '=', 'admin')
      .limit(1)
      .executeTakeFirst();
    return admin === undefined;
  }

  /** Creates the first administrator; refused once one exists. */
  async createFirstAdmin(input: SetupAdminDto): Promise<UserRow> {
    if (!(await this.needsAdmin())) {
      throw apiError(409, 'setup_completed', 'The administrator account already exists');
    }
    const id = await insertReturningId(this.db, this.dialect, 'users', {
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
      role: 'admin',
      status: 'active',
      language: input.language,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      echocallCustomerId: null,
      lastLoginAt: new Date(),
    });
    return this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  }
}
