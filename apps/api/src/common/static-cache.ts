/**
 * Cache headers for the built portal. Every file the build emits carries a
 * content hash in its name, so it can be cached for a year and never revalidated;
 * a new release ships new names. The entry document has no hash and decides which
 * of those files the browser loads, so it must be checked on every visit, and a
 * file someone dropped into the directory by hand gets an hour: long enough to
 * help, short enough to fix a mistake the same day.
 */
const YEAR_SECONDS = 31_536_000;

/**
 * Whether a file name carries a build hash. The hash is base64-ish and therefore
 * mixed case, which is what separates `styles-ZHMVQ6OQ.css` from a hand-written
 * name like `apple-touch-icon.png`.
 */
export function isHashedAsset(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const dash = base.indexOf('-');
  if (dash < 0) return false;
  const suffix = base.slice(dash + 1);
  return suffix.length >= 8 && /[A-Z]/.test(suffix) && /^[A-Za-z0-9_-]+$/.test(suffix);
}

/** The Cache-Control value for one file of the built portal. */
export function cacheControlFor(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() ?? '';
  if (fileName.endsWith('.html')) return 'no-cache';
  if (isHashedAsset(fileName)) return `public, max-age=${YEAR_SECONDS}, immutable`;
  return 'public, max-age=3600';
}
