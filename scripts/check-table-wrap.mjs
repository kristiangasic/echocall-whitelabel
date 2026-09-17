// A table only becomes a stack of cards on a phone because the card layout is
// written against .table-wrap. A table outside one keeps its columns, runs past
// the edge of the screen and takes the page with it, so every mat-table lives
// in a .table-wrap.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'apps/web/src/app';
const TABLE = /<table mat-table/g;
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
    const tables = [...source.matchAll(TABLE)].length;
    if (!tables) continue;
    const wraps = [...source.matchAll(/class="[^"]*\btable-wrap\b/g)].length;
    if (wraps < tables) {
      findings.push(`${relative(process.cwd(), path)}: ${tables} table(s), ${wraps} table-wrap(s)`);
    }
  }
}

walk(root);
if (findings.length) {
  console.error(
    'Table wrap check failed, these tables keep their columns on a phone:\n' + findings.join('\n'),
  );
  process.exit(1);
}
console.log('Table wrap check passed');
