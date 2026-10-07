// Shared by check-angular-tree.mjs and fix-angular-tree.mjs.
import { readFileSync } from 'node:fs';

export const LOCK_FILE = 'package-lock.json';

// The Angular packages the app runs on, as apps/web declares them. The builder
// and the compiler are devDependencies and may stay inside the workspace.
export function runtimePackages() {
  const web = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  return Object.keys(web.dependencies).filter((name) => name.startsWith('@angular/'));
}

// Every place the lock file installs one of them, by package name.
export function runtimeEntries(lock) {
  const names = runtimePackages();
  const found = new Map(names.map((name) => [name, []]));
  for (const [path, entry] of Object.entries(lock.packages)) {
    const name = names.find((n) => path === `node_modules/${n}` || path.endsWith(`/node_modules/${n}`));
    if (name) found.get(name).push({ path, version: entry.version });
  }
  return found;
}
