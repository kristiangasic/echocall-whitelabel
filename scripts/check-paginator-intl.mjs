// A paginator with no translated labels reads "Items per page" in a German
// portal. The labels cannot be provided once at the root: that pulls the whole
// control into the first load. So every page that shows one asks for them, and
// this check makes sure none forgets.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'apps/web/src/app';
const missing = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
    const source = readFileSync(p, 'utf8');
    if (!source.includes('MatPaginatorModule')) continue;
    if (!source.includes('providePaginatorIntl()')) missing.push(relative(process.cwd(), p));
  }
}

walk(root);
if (missing.length) {
  console.error(
    'Paginator label check failed, these components show a paginator without providePaginatorIntl():\n' +
      missing.join('\n'),
  );
  process.exit(1);
}
console.log('Paginator label check passed');
