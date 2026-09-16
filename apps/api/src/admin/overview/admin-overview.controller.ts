import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { Roles } from '../../auth/decorators.js';
import { DB } from '../../db/db.service.js';
import type { Db } from '../../db/dialect.js';
import { type HubStatus, HubStatusService } from '../../echocall/hub-status.service.js';

export interface UserCounts {
  total: number;
  admins: number;
  users: number;
  active: number;
  invited: number;
  disabled: number;
}

export interface AdminOverview {
  hub: HubStatus;
  users: UserCounts;
}

@Controller('admin/overview')
@Roles('admin')
export class AdminOverviewController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly hubStatus: HubStatusService,
  ) {}

  @Get()
  async overview(): Promise<AdminOverview> {
    const rows = await this.db.selectFrom('users').select(['role', 'status']).execute();
    const count = (predicate: (row: { role: string; status: string }) => boolean) =>
      rows.filter(predicate).length;
    return {
      hub: this.hubStatus.current(),
      users: {
        total: rows.length,
        admins: count((row) => row.role === 'admin'),
        users: count((row) => row.role === 'user'),
        active: count((row) => row.status === 'active'),
        invited: count((row) => row.status === 'invited'),
        disabled: count((row) => row.status === 'disabled'),
      },
    };
  }

  /** Re-checks the API key against the service right now instead of waiting for the periodic check. */
  @Post('hub-check')
  @HttpCode(200)
  hubCheck(): Promise<HubStatus> {
    return this.hubStatus.refresh();
  }
}
