import { logoIsInert, svgIsInert } from './logo.js';

function asLogo(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const PLAIN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30"/></svg>';

describe('svgIsInert', () => {
  it('accepts a drawing', () => {
    expect(svgIsInert(PLAIN)).toBe(true);
  });

  it('accepts what a drawing program writes into its files', () => {
    const saved = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <metadata><rdf:RDF><rdf:Description rdf:about="http://example.com/logo"/></rdf:RDF></metadata>
      <rect width="10" height="10"/></svg>`;

    expect(svgIsInert(saved)).toBe(true);
  });

  it('accepts a picture embedded in the drawing', () => {
    const embedded = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>`;

    expect(svgIsInert(embedded)).toBe(true);
  });

  it('refuses a drawing that carries script', () => {
    expect(svgIsInert(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)).toBe(false);
  });

  it('refuses a drawing with an event handler', () => {
    expect(svgIsInert(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`)).toBe(false);
  });

  it('refuses a drawing that holds a page', () => {
    expect(
      svgIsInert(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><b>hi</b></foreignObject></svg>`),
    ).toBe(false);
  });

  it('refuses a link that runs code', () => {
    expect(
      svgIsInert(`<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`),
    ).toBe(false);
  });

  it('refuses a drawing that loads from another server', () => {
    expect(
      svgIsInert(`<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.test/p.png"/></svg>`),
    ).toBe(false);
  });

  it('refuses a style sheet pulled from another server', () => {
    expect(
      svgIsInert(
        `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x.test/a.css);</style></svg>`,
      ),
    ).toBe(false);
  });

  it('refuses a document that defines its own entities', () => {
    expect(
      svgIsInert(
        `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>`,
      ),
    ).toBe(false);
  });

  it('refuses a document hidden behind a picture link', () => {
    expect(
      svgIsInert(
        `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html;base64,PHNjcmlwdD4="/></svg>`,
      ),
    ).toBe(false);
  });
});

describe('logoIsInert', () => {
  it('lets a photograph through without reading it', () => {
    expect(logoIsInert('data:image/png;base64,AAAABBBB')).toBe(true);
  });

  it('accepts a drawing', () => {
    expect(logoIsInert(asLogo(PLAIN))).toBe(true);
  });

  it('refuses a drawing that carries script', () => {
    expect(logoIsInert(asLogo(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`))).toBe(false);
  });

  it('refuses something that is not a drawing at all', () => {
    expect(logoIsInert(asLogo('<html><body>hello</body></html>'))).toBe(false);
  });
});
