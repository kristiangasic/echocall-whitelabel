import { Inject, Injectable, Optional } from '@nestjs/common';
import { type AppConfig, APP_CONFIG } from '../config/env.js';
import { HUB_FETCH, type HubFetch } from '../echocall/hub-client.factory.js';
import { isRewritableType, rewriteWidgetSource } from './widget-rewrite.js';

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface WidgetFile {
  contentType: string;
  body: Buffer;
}

interface CacheEntry {
  expires: number;
  file: WidgetFile;
}

/**
 * Fetches widget loader files from the configured widget origin and keeps
 * them warm for a few minutes, so embedded chat widgets do not hit the
 * origin on every page view. A stale copy is served while the origin is down.
 *
 * Text files are served under the portal's own names: the rewrite happens once,
 * on the way into the cache, so every reader gets the same neutral copy.
 */
@Injectable()
export class WidgetCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  private readonly fetchImpl: HubFetch;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(HUB_FETCH) fetchImpl?: HubFetch,
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** Returns the upstream file, or null when the origin cannot deliver it right now. */
  async get(upstreamPath: string): Promise<WidgetFile | null> {
    const hit = this.cache.get(upstreamPath);
    if (hit && hit.expires > Date.now()) return hit.file;
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.echocall.widgetUrl + upstreamPath);
    } catch {
      return hit?.file ?? null;
    }
    if (!response.ok) return hit?.file ?? null;
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const raw = Buffer.from(await response.arrayBuffer());
    const file: WidgetFile = {
      contentType,
      body: isRewritableType(contentType)
        ? Buffer.from(
            rewriteWidgetSource(raw.toString('utf8'), {
              widgetOrigin: this.config.echocall.widgetUrl,
              embedBase: `${this.config.appUrl.replace(/\/+$/, '')}/embed`,
            }),
            'utf8',
          )
        : raw,
    };
    this.cache.set(upstreamPath, { expires: Date.now() + CACHE_TTL_MS, file });
    return file;
  }
}
