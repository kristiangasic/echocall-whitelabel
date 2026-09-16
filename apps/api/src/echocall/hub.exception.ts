import { HttpException } from '@nestjs/common';
import type { ErrorEnvelope } from '../common/http-error.js';

/**
 * An error answered by the hub (or produced while reaching it), carried as the
 * portal's error envelope so the global filter returns it unchanged.
 */
export class HubException extends HttpException {
  constructor(status: number, body: ErrorEnvelope) {
    super(body, status);
    this.name = 'HubException';
    this.message = body.error.message;
  }

  get envelope(): ErrorEnvelope {
    return this.getResponse() as ErrorEnvelope;
  }

  get code(): string {
    return this.envelope.error.code;
  }
}
