import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';

export interface AuditEvent {
  actorUserId: number | null;
  /** Dotted action name, for example users.invited or settings.branding_updated. */
  action: string;
  targetType?: string;
  targetId?: string | number;
  /** Extra context; must never contain secrets. */
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditRow {
  id: number;
  actorUserId: number | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(event: AuditEvent): Promise<void> {
    await this.db
      .insertInto('auditLog')
      .values({
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId === undefined ? null : String(event.targetId),
        details: event.details === undefined ? null : JSON.stringify(event.details),
        ip: event.ip?.slice(0, 45) ?? null,
      })
      .execute();
  }

  /** Newest first. */
  async list(page: number, limit: number): Promise<Page<AuditRow>> {
    const offset = (page - 1) * limit;
    const rows = await this.db
      .selectFrom('auditLog')
      .leftJoin('users', 'users.id', 'auditLog.actorUserId')
      .select([
        'auditLog.id',
        'auditLog.actorUserId',
        'users.email as actorEmail',
        'auditLog.action',
        'auditLog.targetType',
        'auditLog.targetId',
        'auditLog.details',
        'auditLog.ip',
        'auditLog.createdAt',
      ])
      .orderBy('auditLog.createdAt', 'desc')
      .orderBy('auditLog.id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
    const { total } = await this.db
      .selectFrom('auditLog')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();
    return {
      data: rows.map((row) => ({
        id: Number(row.id),
        actorUserId: row.actorUserId,
        actorEmail: row.actorEmail ?? null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        details: parseDetails(row.details),
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page, limit, total: Number(total) },
    };
  }
}

function parseDetails(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
