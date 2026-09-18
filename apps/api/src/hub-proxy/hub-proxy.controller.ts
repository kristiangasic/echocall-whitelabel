import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import type { SessionUser } from '../auth/session.service.js';
import { apiError } from '../common/http-error.js';
import { HubClientFactory } from '../echocall/hub-client.factory.js';
import { SettingsService } from '../settings/settings.service.js';
import { matchCustomerCall } from './allowlist.js';
import { hideOwnDocumentation, renameProduct } from './vendor-neutral.js';

const METHODS_WITH_BODY = new Set(['POST', 'PATCH', 'PUT']);

/**
 * Forwards allow-listed hub calls in the signed-in customer's context.
 * The browser calls /api/hub/<hub path>?<hub query>; status and body of the
 * hub response come back in their documented shape, with the one change the
 * portal owes its customers: text that names the service reads as the portal.
 */
@Controller('hub')
@Roles('user')
export class HubProxyController {
  constructor(
    private readonly hub: HubClientFactory,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @All('{*path}')
  async forward(@CurrentUser() user: SessionUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (user.echocallCustomerId === null)
      throw apiError(409, 'customer_not_linked', 'This account is not linked to a customer yet');
    const url = new URL(req.originalUrl, 'http://internal');
    const hubPath = url.pathname.replace(/^\/api\/hub/, '');
    if (!matchCustomerCall(req.method, hubPath)) throw apiError(404, 'not_found', 'No such portal endpoint');
    const result = await this.hub.raw(req.method, hubPath, {
      customerId: user.echocallCustomerId,
      query: url.searchParams,
      body: METHODS_WITH_BODY.has(req.method) ? ((req.body as unknown) ?? {}) : undefined,
    });
    if (result.body === null && result.status === 204) {
      res.status(204).send();
      return;
    }
    const { productName } = await this.settings.getBranding();
    const body = hideOwnDocumentation(result.body, this.config.echocall.apiUrl);
    res.status(result.status).json(renameProduct(body, productName));
  }
}
