import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { embedHeaders } from './embed-headers.js';

/** Express names itself before any middleware runs; the handler does the same. */
function handler(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('x-powered-by', 'Express');
  embedHeaders(req as Request, res as Response, () => {
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.end('(function(){})();');
  });
}

describe('embedHeaders', () => {
  it('names no server software and stops the browser from guessing the type', async () => {
    const answer = await request(handler).get('/embed/chat.js');

    expect(answer.status).toBe(200);
    expect(answer.headers['x-powered-by']).toBeUndefined();
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['content-type']).toBe('application/javascript; charset=utf-8');
  });
});
