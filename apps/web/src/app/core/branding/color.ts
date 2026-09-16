export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;

export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mixes `other` into `color`; weight 0 keeps the colour, 1 gives `other`. */
export function mix(color: string, other: string, weight: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(other);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({ r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w });
}

/** Relative luminance as defined by WCAG 2. */
export function luminance(hex: string): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on the colour. */
export function contrastText(hex: string): '#000000' | '#ffffff' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000';
}

/** CSS variables that re-tint the Material theme with one brand colour. */
export function brandTheme(primary: string): Record<string, string> {
  const container = mix(primary, '#ffffff', 0.85);
  return {
    '--brand-primary': primary,
    '--mat-sys-primary': primary,
    '--mat-sys-on-primary': contrastText(primary),
    '--mat-sys-primary-container': container,
    '--mat-sys-on-primary-container': mix(primary, '#000000', 0.6),
    '--mat-sys-surface-tint': primary,
    '--mat-sys-inverse-primary': mix(primary, '#ffffff', 0.6),
  };
}
