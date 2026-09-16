import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { HubClientFactory } from './hub-client.factory.js';
import { HubException } from './hub.exception.js';

export interface HubStatus {
  /** True when the configured key belongs to a reseller with an active subscription. */
  ok: boolean;
  /** ISO timestamp of the last check, empty before the first one. */
  checkedAt: string;
  role?: string;
  email?: string | null;
  error?: { code: string; message: string };
}

export const HUB_STATUS_INTERVAL_MS = 10 * 60_000;

const NOT_CHECKED: HubStatus = {
  ok: false,
  checkedAt: '',
  error: { code: 'not_checked', message: 'The connection to the service has not been checked yet' },
};

/** Keeps the last known answer of the hub about the configured API key and refreshes it periodically. */
@Injectable()
export class HubStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HubStatusService.name);
  private status: HubStatus = NOT_CHECKED;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly hub: HubClientFactory) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), HUB_STATUS_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  current(): HubStatus {
    return this.status;
  }

  /** Asks the hub who the key belongs to and stores the outcome. Never throws. */
  async refresh(): Promise<HubStatus> {
    const checkedAt = new Date().toISOString();
    let next: HubStatus;
    try {
      const profile = await this.hub.call(() => this.hub.forAdmin().GET('/users/me'));
      const identity = { role: profile.role, email: profile.email ?? null };
      next =
        profile.role === 'reseller' && profile.ownResellerId != null
          ? { ok: true, checkedAt, ...identity }
          : {
              ok: false,
              checkedAt,
              ...identity,
              error: { code: 'key_not_reseller', message: 'The API key must belong to a reseller account' },
            };
    } catch (error) {
      const envelope =
        error instanceof HubException
          ? error.envelope.error
          : { code: 'internal_error', message: 'The connection check failed' };
      next = { ok: false, checkedAt, error: { code: envelope.code, message: envelope.message } };
    }
    if (next.ok !== this.status.ok || next.error?.code !== this.status.error?.code) {
      if (next.ok) this.logger.log(`Connected to the service as ${next.email ?? 'reseller'}`);
      else this.logger.warn(`Service connection not ready: ${next.error?.code} (${next.error?.message})`);
    }
    this.status = next;
    return next;
  }
}
