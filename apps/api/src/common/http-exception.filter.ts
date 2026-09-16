import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { describeError, isErrorEnvelope } from './http-error.js';

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_error',
  429: 'too_many_requests',
  500: 'internal_error',
  502: 'upstream_error',
  503: 'service_unavailable',
  504: 'upstream_timeout',
};

function messageFrom(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return fallback;
}

/** Turns every thrown value into the error envelope { error: { code, message, details? } }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorEnvelope(body)) {
        res.status(status).json(body);
        return;
      }
      const message = messageFrom(body, exception.message).replace(/^\w+Exception: /, '');
      res.status(status).json({ error: { code: CODES[status] ?? `http_${status}`, message } });
      return;
    }
    this.logger.error(describeError(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
}
