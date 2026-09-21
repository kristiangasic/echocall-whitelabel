import { All, Controller, Get, Inject, Optional, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CrossSite, Public } from '../auth/decorators.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { HUB_FETCH, type HubFetch } from '../echocall/hub-client.factory.js';
import { renameProduct } from '../hub-proxy/vendor-neutral.js';
import { SettingsService } from '../settings/settings.service.js';
import { brandWidgetPayload, neutralizeWidgetPayload } from './widget-payload.js';
import { isWidgetCallAllowed } from './widget-procedures.js';

/**
 * What the visitor posted, as it arrived. The bytes are kept raw so a widget
 * that spells its content type twice still delivers its input; an already
 * decoded body, as a spec or another parser may leave it, is encoded again.
 */
function requestBody(req: Request): string {
  // Widget calls are JSON, and JSON is UTF-8, so the bytes read back as text.
  return Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
}

/** A file a customer uploaded for their chatbot; no separators that climb out. */
const UPLOAD_PATH = /^(?!.*\.\.)[A-Za-z0-9/._-]+$/;
const UPLOAD_CACHE = 'public, max-age=300';

/**
 * A data URL, split into what it is and what it holds. A portal logo is stored
 * this way so it travels with the settings instead of as a separate file.
 */
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

/** One transparent pixel, for a portal whose operator has stored no logo yet. */
const BLANK_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** What the service answers; named through the fetch type Express's Response shadows. */
type ServiceReply = Awaited<ReturnType<HubFetch>>;

/**
 * The calls an embedded chat widget makes, and the files it shows, served from
 * the portal's own domain. The widget is loaded by a stranger's website and
 * carries no session, so nothing here needs one; what it may ask for is fixed
 * by a list, and the answers are stripped of anything naming the supplier.
 */
@Controller('embed')
@Public()
@CrossSite()
export class EmbedApiController {
  private readonly fetchImpl: HubFetch;

  constructor(
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(HUB_FETCH) fetchImpl?: HubFetch,
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  @All('api/trpc/{*path}')
  async call(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = new URL(req.originalUrl, 'http://internal');
    const procedures = url.pathname.replace(/^\/embed\/api\/trpc\//, '');
    if (!isWidgetCallAllowed(decodeURIComponent(procedures))) {
      res.status(404).json({ error: { code: 'not_found', message: 'No such widget call' } });
      return;
    }

    const target = `${this.serviceOrigin()}/api/trpc/${procedures}${url.search}`;
    let upstream: ServiceReply;
    try {
      upstream = await this.fetchImpl(target, {
        method: req.method,
        // The service checks the embedding page against the chatbot's own list
        // of domains, so the visitor's referer has to travel with the call.
        headers: this.forwardedHeaders(req),
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : requestBody(req),
      });
    } catch {
      res
        .status(502)
        .json({ error: { code: 'upstream_unavailable', message: 'The chat service did not answer' } });
      return;
    }

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    if (!contentType.includes('json')) {
      res.status(upstream.status).type(contentType).send(text);
      return;
    }
    const { productName } = await this.settings.getBranding();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      res
        .status(502)
        .json({ error: { code: 'upstream_unavailable', message: 'The chat service answered unreadably' } });
      return;
    }
    const neutral = neutralizeWidgetPayload(payload, this.embedBase());
    res.status(upstream.status).json(renameProduct(brandWidgetPayload(neutral, productName), productName));
  }

  /**
   * The picture the widget shows beside a message when the chatbot carries none
   * of its own. It asks the site it was loaded from for this one file, so the
   * portal answers with its operator's logo; the supplier's would be the one
   * thing a visitor must never see here.
   */
  @Get('logo.png')
  async logo(@Res() res: Response): Promise<void> {
    const { logoDataUrl } = await this.settings.getBranding();
    const stored = logoDataUrl === null ? null : DATA_URL.exec(logoDataUrl);
    res.setHeader('cache-control', UPLOAD_CACHE);
    res.type(stored === null ? 'image/png' : stored[1]);
    res.send(stored === null ? BLANK_PIXEL : Buffer.from(stored[2], 'base64'));
  }

  @Get('uploads/{*path}')
  async upload(@Req() req: Request, @Res() res: Response): Promise<void> {
    const path = new URL(req.originalUrl, 'http://internal').pathname.replace(/^\/embed\/uploads\//, '');
    if (!UPLOAD_PATH.test(path)) {
      res.status(404).json({ error: { code: 'not_found', message: 'No such file' } });
      return;
    }
    let upstream: ServiceReply;
    try {
      upstream = await this.fetchImpl(`${this.serviceOrigin()}/uploads/${path}`);
    } catch {
      res
        .status(502)
        .json({ error: { code: 'upstream_unavailable', message: 'The chat service did not answer' } });
      return;
    }
    if (!upstream.ok) {
      res.status(404).json({ error: { code: 'not_found', message: 'No such file' } });
      return;
    }
    res.setHeader('cache-control', UPLOAD_CACHE);
    res.type(upstream.headers.get('content-type') ?? 'application/octet-stream');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  }

  /** Only what the call needs: no cookies, no authorisation, no visitor address. */
  private forwardedHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const name of ['referer', 'origin', 'accept', 'accept-language', 'user-agent']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    return headers;
  }

  /** Where the service answers. The widget files may come from elsewhere. */
  private serviceOrigin(): string {
    return new URL(this.config.echocall.apiUrl).origin;
  }

  private embedBase(): string {
    return `${this.config.appUrl.replace(/\/+$/, '')}/embed`;
  }
}
