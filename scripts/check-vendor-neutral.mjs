// Fails when the repository names the upstream speech vendor anywhere. The terms are
// stored base64-encoded so this file does not violate the rule it enforces.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const terms = ['ZWxldmVubGFicw==', 'ZWxldmVuX3Yz', 'eGktYXBpLWtleQ==', 'MTFsYWJz', 'ZWxldmVuIGxhYnM='].map(
  (t) => Buffer.from(t, 'base64').toString('utf8'),
);
const skipDirs = new Set(['node_modules', 'dist', '.git', '.angular', 'coverage']);
const textExt = new Set([
  '.ts',
  '.mts',
  '.mjs',
  '.cjs',
  '.js',
  '.json',
  '.md',
  '.html',
  '.scss',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
  '.env',
  '.example',
  '.sql',
  '.sh',
]);
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!skipDirs.has(name)) walk(p);
      continue;
    }
    if (!textExt.has(extname(name)) && !name.startsWith('.env') && name !== 'Dockerfile') continue;
    if (p.endsWith('check-vendor-neutral.mjs')) continue;
    const text = readFileSync(p, 'utf8').toLowerCase();
    for (const term of terms) {
      if (text.includes(term)) hits.push(`${relative(process.cwd(), p)}: contains "${term.slice(0, 3)}..."`);
    }
  }
}

walk(process.cwd());
if (hits.length) {
  console.error('Vendor-neutrality check failed:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('Vendor-neutrality check passed');
