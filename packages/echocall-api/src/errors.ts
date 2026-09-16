/** The single error envelope every failing hub request answers with. */
export interface HubErrorBody {
  error: { code: string; message: string; details?: unknown; requiredScope?: string };
}

export class HubRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HubRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isHubErrorBody(body: unknown): body is HubErrorBody {
  if (!body || typeof body !== 'object') return false;
  const error = (body as { error?: unknown }).error;
  return !!error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string';
}

/** Turns a hub response into an error, keeping the hub's code when the body is the standard envelope. */
export function toHubRequestError(status: number, body: unknown): HubRequestError {
  if (isHubErrorBody(body)) {
    return new HubRequestError(status, body.error.code, body.error.message, body.error.details);
  }
  return new HubRequestError(status, 'upstream_error', `Unexpected response from the API (${status})`);
}
