// On a phone every table row is stacked as a card, and each cell shows its own
// label because the header row is gone. The label comes from data-label on the
// cell, so a cell without one reads as a bare value with nothing to say what it
// is. Cells that carry no value of their own (the row menu) are exempt.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'apps/web/src/app';

/** Cells that hold a control rather than a value, and therefore need no label. */
const EXEMPT = /class="[^"]*\b(cell-actions|row-actions)\b[^"]*"/;

const CELL = /<td mat-cell \*matCellDef="[^"]+"[^>]*>/g;
const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
    const source = readFileSync(path, 'utf8');
    if (!source.includes('mat-table')) continue;
    for (const [tag] of source.matchAll(CELL)) {
      if (tag.includes('data-label') || EXEMPT.test(tag)) continue;
      findings.push(`${relative(process.cwd(), path)}: ${tag.replaceAll(/\s+/g, ' ')}`);
    }
  }
}

walk(root);
if (findings.length) {
  console.error(
    'Table label check failed, these cells have no data-label and would be unreadable on a phone:\n' +
      findings.join('\n'),
  );
  process.exit(1);
}
console.log('Table label check passed');
