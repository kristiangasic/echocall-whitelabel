import { fitWithin, LOGO_MAX_CHARS, LogoFileError, type LogoTools, prepareLogo } from './logo-file';

function pickedFile(type: string, name = 'logo'): File {
  return new File(['x'], name, { type });
}

/** A stand-in browser: it reports the size it is told and draws what it is told. */
function tools(options: {
  original?: string;
  size?: { width: number; height: number };
  drawn?: (type: string, quality?: number) => string;
}): LogoTools & { redraws: { type: string; quality?: number }[] } {
  const redraws: { type: string; quality?: number }[] = [];
  return {
    redraws,
    read: async () => options.original ?? 'data:image/png;base64,AAAA',
    measure: async () => options.size ?? { width: 1024, height: 1024 },
    redraw: async (_url, _width, _height, type, quality) => {
      redraws.push({ type, quality });
      return options.drawn ? options.drawn(type, quality) : 'data:image/png;base64,SMALL';
    },
  };
}

describe('fitWithin', () => {
  it('keeps a picture that already fits', () => {
    expect(fitWithin(400, 120, 640, 200)).toEqual({ width: 400, height: 120 });
  });

  it('shrinks a square picture to the lower bound', () => {
    expect(fitWithin(1024, 1024, 640, 200)).toEqual({ width: 200, height: 200 });
  });

  it('keeps the proportions of a wide picture', () => {
    expect(fitWithin(1600, 400, 640, 200)).toEqual({ width: 640, height: 160 });
  });

  it('never returns less than a single pixel', () => {
    expect(fitWithin(10000, 1, 640, 200)).toEqual({ width: 640, height: 1 });
  });

  it('reports nothing for a picture without a size', () => {
    expect(fitWithin(0, 0, 640, 200)).toEqual({ width: 0, height: 0 });
  });
});

describe('prepareLogo', () => {
  it('refuses a file that is not a picture', async () => {
    await expect(prepareLogo(pickedFile('application/pdf'), tools({}))).rejects.toMatchObject({
      problem: 'type',
    });
  });

  it('shrinks a large photograph instead of refusing it', async () => {
    const browser = tools({ original: `data:image/png;base64,${'A'.repeat(600 * 1024)}` });

    const stored = await prepareLogo(pickedFile('image/png'), browser);

    expect(stored).toBe('data:image/png;base64,SMALL');
    expect(browser.redraws).toEqual([{ type: 'image/png', quality: undefined }]);
  });

  it('keeps a small picture untouched', async () => {
    const browser = tools({ original: 'data:image/png;base64,TINY', size: { width: 320, height: 100 } });

    const stored = await prepareLogo(pickedFile('image/png'), browser);

    expect(stored).toBe('data:image/png;base64,TINY');
    expect(browser.redraws).toEqual([]);
  });

  it('tries a denser format when the drawing is still too heavy', async () => {
    const heavy = `data:image/png;base64,${'A'.repeat(LOGO_MAX_CHARS)}`;
    const browser = tools({
      original: heavy,
      drawn: (type, quality) =>
        type === 'image/webp' && quality === 0.8 ? 'data:image/webp;base64,OK' : heavy,
    });

    const stored = await prepareLogo(pickedFile('image/png'), browser);

    expect(stored).toBe('data:image/webp;base64,OK');
    expect(browser.redraws).toHaveLength(3);
  });

  it('gives up when even the densest drawing is too heavy', async () => {
    const heavy = `data:image/png;base64,${'A'.repeat(LOGO_MAX_CHARS)}`;
    const browser = tools({ original: heavy, drawn: () => heavy });

    await expect(prepareLogo(pickedFile('image/png'), browser)).rejects.toBeInstanceOf(LogoFileError);
  });

  it('passes a drawing without pixels through as it is', async () => {
    const browser = tools({ original: 'data:image/svg+xml;base64,U1ZH' });

    const stored = await prepareLogo(pickedFile('image/svg+xml'), browser);

    expect(stored).toBe('data:image/svg+xml;base64,U1ZH');
    expect(browser.redraws).toEqual([]);
  });

  it('refuses a drawing that is too heavy to store', async () => {
    const browser = tools({ original: `data:image/svg+xml;base64,${'A'.repeat(LOGO_MAX_CHARS)}` });

    await expect(prepareLogo(pickedFile('image/svg+xml'), browser)).rejects.toMatchObject({
      problem: 'tooLarge',
    });
  });

  it('refuses a picture the browser cannot measure', async () => {
    const browser = tools({ size: { width: 0, height: 0 } });

    await expect(prepareLogo(pickedFile('image/png'), browser)).rejects.toMatchObject({
      problem: 'unreadable',
    });
  });
});
