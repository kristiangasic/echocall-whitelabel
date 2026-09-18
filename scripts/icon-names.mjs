// Which icons the portal draws. Read from the templates so that the font and
// the check below can never disagree with the code: an icon is either written
// out in a template or picked from a handful of literals in an expression, and
// both forms are collected here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, '..', 'apps', 'web', 'src', 'app');
export const NAMES_FILE = resolve(HERE, 'icon-names.json');

const TAG = /<mat-icon[^>]*>([\s\S]*?)<\/mat-icon>/g;
const PLAIN = /^[a-z0-9_]+$/;
// The two sides of a choice, without the value it is compared against.
const CHOICE = /\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g;
// Icons named in code, for a navigation list or a table of kinds.
const PROPERTY = /\bicon:\s*'([a-z0-9_]+)'/g;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) yield path;
  }
}

/** Every icon name the application can ask for, sorted. */
export function iconNames() {
  const names = new Set();
  for (const file of files(SOURCE)) {
    const source = readFileSync(file, 'utf8');
    for (const [, body] of source.matchAll(TAG)) {
      const text = body.trim();
      if (PLAIN.test(text)) {
        names.add(text);
        continue;
      }
      for (const [, yes, no] of text.matchAll(CHOICE)) {
        names.add(yes);
        names.add(no);
      }
    }
    for (const [, name] of source.matchAll(PROPERTY)) names.add(name);
  }
  return [...names].sort();
}
