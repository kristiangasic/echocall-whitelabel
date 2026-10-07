// Repairs what check-angular-tree.mjs reports. It removes the Angular runtime
// entries from the existing lock file and lets npm place them again, which puts
// the whole set at the root in one step. Everything else in the lock stays as
// it is, including the Linux binaries that CI and the container image install
// with npm ci. Never delete the lock file to rebuild it: an install from nothing
// records only the platform it runs on.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { LOCK_FILE, runtimeEntries } from './angular-tree.mjs';

// npm run sets npm_execpath, so the same npm starts again without a shell.
if (!process.env.npm_execpath) {
  console.error('Start this with "npm run fix:angular-tree".');
  process.exit(1);
}
const npm = (args) => spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: 'inherit' });

const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
let removed = 0;
for (const places of runtimeEntries(lock).values()) {
  for (const place of places) {
    delete lock.packages[place.path];
    removed += 1;
  }
}
writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Removed ${removed} Angular runtime entries from ${LOCK_FILE}, installing them again`);

const install = npm(['install', '--no-audit', '--no-fund']);
if (install.status !== 0) process.exit(install.status ?? 1);
process.exit(npm(['run', 'check:angular-tree']).status ?? 1);
