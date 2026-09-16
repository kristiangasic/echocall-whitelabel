import { brandTheme, contrastText, hexToRgb, mix, rgbToHex } from './color';

describe('colour helpers', () => {
  it('converts between hex and rgb', () => {
    expect(hexToRgb('#2563eb')).toEqual({ r: 37, g: 99, b: 235 });
    expect(hexToRgb('2563EB')).toEqual({ r: 37, g: 99, b: 235 });
    expect(rgbToHex({ r: 37, g: 99, b: 235 })).toBe('#2563eb');
    expect(rgbToHex({ r: 300, g: -5, b: 12.4 })).toBe('#ff000c');
    expect(() => hexToRgb('blue')).toThrow('Not a hex colour');
  });

  it('mixes colours and picks readable text', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#2563eb', '#ffffff', 0)).toBe('#2563eb');
    expect(mix('#2563eb', '#ffffff', 1)).toBe('#ffffff');
    expect(contrastText('#2563eb')).toBe('#ffffff');
    expect(contrastText('#ffeb3b')).toBe('#000000');
    expect(contrastText('#ffffff')).toBe('#000000');
  });

  it('derives the Material variables from the brand colour', () => {
    const theme = brandTheme('#2563eb');
    expect(theme['--mat-sys-primary']).toBe('#2563eb');
    expect(theme['--mat-sys-on-primary']).toBe('#ffffff');
    expect(theme['--mat-sys-primary-container']).toBe('#dee8fc');
    expect(theme['--mat-sys-on-primary-container']).toBe('#0f285e');
    expect(Object.keys(theme).every((name) => name.startsWith('--'))).toBe(true);
  });
});
