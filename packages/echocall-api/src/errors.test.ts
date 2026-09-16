import { describe, it, expect } from 'vitest';
import { HubRequestError, isHubErrorBody, toHubRequestError } from './errors';

describe('toHubRequestError', () => {
  it('reads the hub error envelope', () => {
    const e = toHubRequestError(404, {
      error: { code: 'not_found', message: 'Agent not found', details: { id: 1 } },
    });
    expect(e).toBeInstanceOf(HubRequestError);
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
    expect(e.code).toBe('not_found');
    expect(e.message).toBe('Agent not found');
    expect(e.details).toEqual({ id: 1 });
  });

  it('falls back to a generic code for unexpected bodies', () => {
    const e = toHubRequestError(502, '<html>');
    expect(e.code).toBe('upstream_error');
    expect(e.status).toBe(502);
    expect(e.message).toContain('502');
  });

  it('recognises only the standard envelope', () => {
    expect(isHubErrorBody({ error: { code: 'x', message: 'y' } })).toBe(true);
    expect(isHubErrorBody({ error: 'x' })).toBe(false);
    expect(isHubErrorBody(null)).toBe(false);
    expect(isHubErrorBody({ code: 'x' })).toBe(false);
  });
});
