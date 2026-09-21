import { raw, type RequestHandler } from 'express';

/** Where an embedded widget posts. Everything under it is forwarded untouched. */
export const EMBED_TRPC_PATH = '/embed/api/trpc';

/**
 * Keeps the bytes a widget posted exactly as they arrived.
 *
 * The widget names its content type twice, in two spellings, and a browser
 * joins the two into a single value that no JSON parser recognises. A body
 * parsed under that rule comes out empty, and the call would reach the service
 * without its input. The portal only passes this body on, so there is nothing
 * for it to parse: it reads the raw bytes and hands them over unchanged.
 */
export function embedRawBody(limit: string): RequestHandler {
  return raw({ type: () => true, limit });
}
