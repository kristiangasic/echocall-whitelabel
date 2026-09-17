import { describe, expect, it } from 'vitest';
import { cacheControlFor, isHashedAsset } from './static-cache.js';

describe('isHashedAsset', () => {
  it('recognises the names the build emits', () => {
    expect(isHashedAsset('styles-ZHMVQ6OQ.css')).toBe(true);
    expect(isHashedAsset('chunk-B1RRq0Nl.js')).toBe(true);
    expect(isHashedAsset('chunk-B-YkNNVA2.js')).toBe(true);
    expect(isHashedAsset('material-icons-JLIDJUWE.woff2')).toBe(true);
  });

  it('does not mistake a hand-written name for a hash', () => {
    expect(isHashedAsset('favicon.ico')).toBe(false);
    expect(isHashedAsset('robots.txt')).toBe(false);
    expect(isHashedAsset('apple-touch-icon.png')).toBe(false);
    expect(isHashedAsset('logo.svg')).toBe(false);
  });
});

describe('cacheControlFor', () => {
  it('lets a hashed file be kept for a year', () => {
    expect(cacheControlFor('/srv/web/chunk-B1RRq0Nl.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor(String.raw`C:\srv\web\media\material-icons-JLIDJUWE.woff2`)).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('has the entry document checked on every visit', () => {
    expect(cacheControlFor('/srv/web/index.html')).toBe('no-cache');
  });

  it('keeps an unhashed file for an hour', () => {
    expect(cacheControlFor('/srv/web/favicon.ico')).toBe('public, max-age=3600');
  });
});
