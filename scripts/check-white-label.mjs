// End customers must only ever see the operator's brand. Fails when the product name of
// the upstream platform appears in customer-facing code, translations or mail templates.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = [
  'apps/web/src/app/features/user',
  'apps/web/src/app/layout',
  'apps/web/public/i18n/user',
  'apps/api/src/mail/templates',
];
const forbidden = /echocall/i;
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (forbidden.test(line)) hits.push(`${relative(process.cwd(), p)}:${i + 1}: ${line.trim()}`);
    });
  }
}

for (const root of roots) if (existsSync(root)) walk(root);
if (hits.length) {
  console.error('White-label check failed:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('White-label check passed');
