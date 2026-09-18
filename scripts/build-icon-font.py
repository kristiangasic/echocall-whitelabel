"""Cuts the icon font down to the icons the portal actually draws.

The published font carries about 2200 icons in 128 kB, of which this portal
uses fewer than eighty: on a phone that is most of a second spent on glyphs
nobody sees. This reads the names out of the templates, keeps those glyphs and
the letters their ligatures are written with, and drops the rest, which leaves
a few kilobytes.

Run it after adding or removing an icon:

    npm run icons:build

It needs fontTools with brotli, which the normal build does not:

    pip install "fonttools[woff]"

It writes apps/web/src/fonts/material-icons.woff2 and scripts/icon-names.json,
both of which belong in the commit. scripts/check-icons.mjs, which does run in
the normal checks, fails if the two ever drift apart from the templates.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'node_modules' / 'material-icons' / 'iconfont' / 'material-icons.woff2'
TARGET = ROOT / 'apps' / 'web' / 'src' / 'fonts' / 'material-icons.woff2'
NAMES = ROOT / 'scripts' / 'icon-names.json'
LETTERS = 'abcdefghijklmnopqrstuvwxyz_'


def used_names() -> list[str]:
    """The names the templates ask for, read by the same script the check uses."""
    out = subprocess.run(
        ['node', '--input-type=module', '-e',
         'import { iconNames } from "./scripts/icon-names.mjs"; console.log(JSON.stringify(iconNames()));'],
        cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def ligatures(font: TTFont) -> dict[str, str]:
    """Icon name to glyph, read from the ligature table the font renders by."""
    cmap = font.getBestCmap()
    letter = {glyph: chr(code) for code, glyph in cmap.items() if chr(code) in LETTERS}
    found: dict[str, str] = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            for first, entries in getattr(table, 'ligatures', {}).items():
                for entry in entries:
                    parts = [first] + list(entry.Component)
                    if all(part in letter for part in parts):
                        found[''.join(letter[part] for part in parts)] = entry.LigGlyph
    return found


def main() -> int:
    font = TTFont(SOURCE)
    known = ligatures(font)
    wanted = used_names()

    unknown = [name for name in wanted if name not in known]
    if unknown:
        print('These icon names are not in the font, so they would be printed as text:')
        for name in unknown:
            print(f'  {name}')
        return 1

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    glyphs = sorted({known[name] for name in wanted})
    subprocess.run(
        [sys.executable, '-m', 'fontTools.subset', str(SOURCE),
         f'--output-file={TARGET}', '--flavor=woff2',
         '--layout-features+=liga', '--no-layout-closure', '--no-hinting',
         f'--glyphs={",".join(glyphs)}', f'--text={LETTERS}'],
        check=True)

    NAMES.write_text(json.dumps(wanted, indent=2) + '\n', encoding='utf-8')
    print(f'{len(wanted)} icons, {TARGET.stat().st_size // 1024} kB at {TARGET.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
