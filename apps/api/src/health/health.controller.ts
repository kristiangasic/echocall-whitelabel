import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sql } from 'kysely';
import { Public } from '../auth/decorators.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { type HubStatus, HubStatusService, publicHubStatus } from '../echocall/hub-status.service.js';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  database: boolean;
  /** Reduced on purpose: the probe is public, so it says whether, not who. */
  hub: HubStatus;
}

/**
 * Liveness and readiness probes for container orchestration. Both routes are
 * excluded from the /api prefix in main.ts and reachable without a session.
 */
@Controller()
@Public()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly hubStatus: HubStatusService,
  ) {}

  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(@Res() res: Response): Promise<void> {
    let database = true;
    try {
      await sql`select 1`.execute(this.db);
    } catch {
      database = false;
    }
    const hub = publicHubStatus(this.hubStatus.current());
    const ready = database && hub.ok;
    const report: ReadinessReport = { status: ready ? 'ok' : 'degraded', database, hub };
    res.status(ready ? 200 : 503).json(report);
  }
}
