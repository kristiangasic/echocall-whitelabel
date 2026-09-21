/**
 * Turns a logo a person picked on their computer into something the portal can
 * store.
 *
 * A company logo is usually a large picture meant for print or for a website
 * header, while the portal shows it in a sidebar that is a few hundred pixels
 * wide. Asking people to shrink the file themselves is asking them to do work
 * the browser can do in a moment, so the picture is drawn once at the size the
 * portal actually shows and only the small copy is kept.
 */

/** The picture formats a logo may be given in. */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** The logo is stored as text, and the settings accept 200 KB of it. */
export const LOGO_MAX_CHARS = 200 * 1024;

/** Twice the size the sidebar shows, so the logo stays sharp on dense screens. */
export const LOGO_MAX_WIDTH = 640;
export const LOGO_MAX_HEIGHT = 200;

/** Why a picked file cannot become a logo. */
export type LogoProblem = 'type' | 'tooLarge' | 'unreadable';

export class LogoFileError extends Error {
  constructor(readonly problem: LogoProblem) {
    super(problem);
    this.name = 'LogoFileError';
  }
}

/**
 * The size a picture is drawn at so it fits the given bounds without changing
 * its proportions. A picture that already fits is left at its own size.
 */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const factor = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/** The steps that need a browser, kept apart so the decisions can be tested. */
export interface LogoTools {
  read(file: Blob): Promise<string>;
  measure(dataUrl: string): Promise<{ width: number; height: number }>;
  redraw(dataUrl: string, width: number, height: number, type: string, quality?: number): Promise<string>;
}

/** The formats a shrunk logo is offered in, smallest result wins. */
const OUTPUTS: { type: string; quality?: number }[] = [
  { type: 'image/png' },
  { type: 'image/webp', quality: 0.92 },
  { type: 'image/webp', quality: 0.8 },
];

/**
 * Reads a picked file and returns the data URL to store. Raster pictures are
 * drawn down to the size the portal shows; an SVG is kept as it is, because it
 * carries no pixels to shrink.
 *
 * Throws a {@link LogoFileError} naming what is wrong with the file.
 */
export async function prepareLogo(file: File, tools: LogoTools = browserLogoTools): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) throw new LogoFileError('type');

  const original = await tools.read(file);

  if (file.type === 'image/svg+xml') {
    if (original.length > LOGO_MAX_CHARS) throw new LogoFileError('tooLarge');
    return original;
  }

  const size = await tools.measure(original);
  const target = fitWithin(size.width, size.height, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT);
  if (target.width === 0) throw new LogoFileError('unreadable');

  const fits = target.width === size.width && target.height === size.height;
  if (fits && original.length <= LOGO_MAX_CHARS) return original;

  let smallest = fits ? original : '';
  for (const output of OUTPUTS) {
    const drawn = await tools.redraw(original, target.width, target.height, output.type, output.quality);
    if (drawn.length <= LOGO_MAX_CHARS) return drawn;
    if (smallest === '' || drawn.length < smallest.length) smallest = drawn;
  }
  throw new LogoFileError('tooLarge');
}

/** Loads a data URL into a picture the browser can draw. */
function load(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new LogoFileError('unreadable'));
    image.src = dataUrl;
  });
}

export const browserLogoTools: LogoTools = {
  read: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new LogoFileError('unreadable'));
      reader.readAsDataURL(file);
    }),

  measure: async (dataUrl) => {
    const image = await load(dataUrl);
    return { width: image.naturalWidth, height: image.naturalHeight };
  },

  redraw: async (dataUrl, width, height, type, quality) => {
    const image = await load(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new LogoFileError('unreadable');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const drawn = canvas.toDataURL(type, quality);
    // A format the browser cannot write comes back as a PNG, which is still a
    // usable logo, so whatever it produced is what we measure.
    return drawn;
  },
};
