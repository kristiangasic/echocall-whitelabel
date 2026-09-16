import { HttpException } from '@nestjs/common';

export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

/** Builds an HttpException whose body follows the portal's error envelope. */
export function apiError(status: number, code: string, message: string, details?: unknown): HttpException {
  const body: ErrorEnvelope = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return new HttpException(body, status);
}

export function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
  );
}

/** Renders an unknown thrown value for logs without leaking object internals into responses. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unserializable error';
  }
}
