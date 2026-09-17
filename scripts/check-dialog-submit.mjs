// A dialog that takes typed input has to close on Enter, because that is how a
// keyboard reaches its save button. The browser only submits a form, and only
// presses a button of type submit, so a dialog with an input needs both: the
// form has to carry (ngSubmit), and the save button has to sit inside it with
// type="submit". A dialog that only shows something, or only offers a choice,
// has nothing to submit and is left alone.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'apps/web/src/app';
// A field the user types into. A checkbox, a toggle or a select is a choice,
// not typing, and Enter has no obvious meaning there.
const TYPED_INPUT = /<(input|textarea)\b(?![^>]*type="(checkbox|radio|file)")/;
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
    if (!source.includes('<mat-dialog-content')) continue;
    if (!TYPED_INPUT.test(source)) continue;
    const file = relative(process.cwd(), path);
    if (!/<form[^>]*\(ngSubmit\)/.test(source)) {
      findings.push(`${file}: takes typed input but has no form with (ngSubmit)`);
      continue;
    }
    if (!source.includes('type="submit"')) {
      findings.push(`${file}: has a form but no button of type="submit" to press`);
    }
  }
}

walk(root);
if (findings.length) {
  console.error(
    'Dialog submit check failed, these dialogs cannot be saved from the keyboard:\n' +
      findings.join('\n'),
  );
  process.exit(1);
}
console.log('Dialog submit check passed');
