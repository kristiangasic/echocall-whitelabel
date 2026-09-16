import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from '../models';

export interface ApiError {
  status: number;
  /** Machine-readable code from the API envelope; `network` when the server did not answer, `unknown` otherwise. */
  code: string;
  message: string;
  details?: unknown;
}

function isEnvelope(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return !!error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string';
}

/** Normalises anything a request can throw into status, code and message. */
export function readApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (isEnvelope(error.error)) {
      const { code, message, details } = error.error.error;
      return { status: error.status, code, message, details };
    }
    return {
      status: error.status,
      code: error.status === 0 ? 'network' : 'unknown',
      message: error.message,
    };
  }
  return { status: 0, code: 'unknown', message: error instanceof Error ? error.message : String(error) };
}

/** Per-field messages of a 400 validation_error, keyed by field path. */
export function fieldErrors(error: ApiError): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(error.details)) return out;
  for (const item of error.details as unknown[]) {
    if (item && typeof item === 'object' && 'path' in item && 'message' in item) {
      const { path, message } = item as { path: unknown; message: unknown };
      if (typeof path === 'string' && typeof message === 'string') out[path] = message;
    }
  }
  return out;
}
