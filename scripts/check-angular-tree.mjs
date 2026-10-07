// The Angular packages require each other at the exact same version. When a
// release replaces another, npm cannot swap one of them at the root on its own
// and nests the new release under apps/web instead, while @jsverse/transloco
// keeps the old core at the root. Two Angular runtimes in one tree break
// dependency injection (NG0203) far away from the lock file that caused it.
// This names the cause before the tests fail.
import { readFileSync } from 'node:fs';
import { LOCK_FILE, runtimeEntries } from './angular-tree.mjs';

const entries = runtimeEntries(JSON.parse(readFileSync(LOCK_FILE, 'utf8')));
const problems = [];

for (const [name, places] of entries) {
  const atRoot = places.some((place) => place.path === `node_modules/${name}`);
  if (places.length !== 1 || !atRoot) {
    const where = places.map((place) => `${place.path} ${place.version}`).join(', ');
    problems.push(`${name}: ${where || 'not in the lock file'}`);
  }
}

if (problems.length) {
  console.error('The lock file must install each Angular runtime package once, at the root:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('Run "npm run fix:angular-tree", then commit package-lock.json.');
  process.exit(1);
}
console.log(`Angular tree check passed (${entries.size} runtime packages, one copy each at the root)`);
