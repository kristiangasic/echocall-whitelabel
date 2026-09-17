import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../auth/decorators.js';
import { apiError } from '../../common/http-error.js';
import { HubClientFactory } from '../../echocall/hub-client.factory.js';
import { matchOperatorCall } from './admin-allowlist.js';

const METHODS_WITH_BODY = new Set(['POST', 'PATCH', 'PUT']);

/**
 * Forwards allow-listed hub calls in the portal operator's own context.
 * The browser calls /api/admin/hub/<hub path>?<hub query>; status and body of
 * the hub response come back untouched. Unlike the customer proxy this one does
 * not rename the service: the operator holds the contract with it and has to
 * read its real name, for example when escalating a ticket.
 */
@Controller('admin/hub')
@Roles('admin')
export class AdminHubProxyController {
  constructor(private readonly hub: HubClientFactory) {}

  @All('{*path}')
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = new URL(req.originalUrl, 'http://internal');
    const hubPath = url.pathname.replace(/^\/api\/admin\/hub/, '');
    if (!matchOperatorCall(req.method, hubPath))
      throw apiError(404, 'not_found', 'No such operator endpoint');
    const result = await this.hub.raw(req.method, hubPath, {
      query: url.searchParams,
      body: METHODS_WITH_BODY.has(req.method) ? ((req.body as unknown) ?? {}) : undefined,
    });
    if (result.body === null && result.status === 204) {
      res.status(204).send();
      return;
    }
    res.status(result.status).json(result.body);
  }
}
