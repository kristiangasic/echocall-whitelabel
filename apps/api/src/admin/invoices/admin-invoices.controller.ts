import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators.js';
import { apiError } from '../../common/http-error.js';
import { HubClientFactory } from '../../echocall/hub-client.factory.js';

/** Filenames the portal is willing to echo back into a Content-Disposition header. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,120}\.pdf$/;

/**
 * The document of an invoice the operator raised.
 *
 * This is not part of the operator proxy on purpose. The service answers that
 * call with a link to one of its own session-protected routes, which is of no
 * use to a portal browser, so the bytes are fetched here and handed on. The
 * operator's own key is what fetches them, exactly as in the proxy.
 */
@Controller('admin/invoices')
@Roles('admin')
export class AdminInvoicesController {
  constructor(private readonly hub: HubClientFactory) {}

  @Get(':id/pdf')
  async invoicePdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    if (!/^[0-9]+$/.test(id)) throw apiError(400, 'invalid_id', 'The invoice id must be a number');
    const result = await this.hub.raw('GET', `/resellers/invoices/${id}/pdf`, {
      accept: 'binary',
      headers: { accept: 'application/pdf' },
    });
    if (!result.contentType?.startsWith('application/pdf'))
      throw apiError(502, 'invoice_unavailable', 'The invoice document is not available right now');
    const match = /filename="([^"]+)"/.exec(result.headers.get('content-disposition') ?? '');
    const reported = match?.[1];
    const filename = reported && SAFE_FILENAME.test(reported) ? reported : `invoice-${id}.pdf`;
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.send(result.body as Buffer);
  }
}
