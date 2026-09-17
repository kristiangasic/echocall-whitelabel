import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { WidgetCacheService } from './widget-cache.service.js';

/** One plain file name inside the widget asset folder; no separators, no dot-dot. */
const ASSET_NAME = /^(?!.*\.\.)[A-Za-z0-9._-]+$/;
const BROWSER_CACHE = 'public, max-age=300';

/**
 * Serves the chat widget under the portal's own domain. Customer sites embed
 * <script src="{portal}/embed/chat.js" data-id="..."> and never see the hub;
 * the loader then requests widget.html and its assets from this controller.
 */
@Controller('embed')
@Public()
export class EmbedController {
  constructor(private readonly widgets: WidgetCacheService) {}

  @Get('chat.js')
  async loader(@Res() res: Response): Promise<void> {
    const file = await this.widgets.get('/widget.js');
    if (!file) {
      res.status(503).type('application/javascript').send('/* chat widget temporarily unavailable */');
      return;
    }
    res.setHeader('cache-control', BROWSER_CACHE);
    res.type('application/javascript').send(file.body);
  }

  @Get('widget.html')
  async frame(@Res() res: Response): Promise<void> {
    const file = await this.widgets.get('/widget.html');
    if (!file) {
      this.unavailable(res);
      return;
    }
    // The upstream document references its bundles root-relative; point them
    // at this controller so the iframe loads everything from the portal.
    const html = file.body.toString('utf8').replaceAll('/assets/', '/embed/assets/');
    res.setHeader('cache-control', BROWSER_CACHE);
    // The widget is made to be framed by any customer site, unlike the portal itself.
    res.setHeader('content-security-policy', 'frame-ancestors *');
    res.type('text/html').send(html);
  }

  @Get('assets/:file')
  async asset(@Param('file') name: string, @Res() res: Response): Promise<void> {
    if (!ASSET_NAME.test(name)) {
      res.status(404).json({ error: { code: 'not_found', message: 'No such widget asset' } });
      return;
    }
    const file = await this.widgets.get(`/assets/${name}`);
    if (!file) {
      this.unavailable(res);
      return;
    }
    res.setHeader('cache-control', BROWSER_CACHE);
    res.setHeader('content-type', file.contentType);
    res.send(file.body);
  }

  private unavailable(res: Response): void {
    res.status(503).json({
      error: { code: 'upstream_unavailable', message: 'The widget origin did not answer' },
    });
  }
}
