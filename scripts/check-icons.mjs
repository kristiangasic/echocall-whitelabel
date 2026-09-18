// The font carries only the icons the portal draws, so an icon added to a
// template without rebuilding the font would be printed as its own name in
// the middle of the interface. This says so before anyone sees it.
import { readFileSync } from 'node:fs';
import { iconNames, NAMES_FILE } from './icon-names.mjs';

const inFont = new Set(JSON.parse(readFileSync(NAMES_FILE, 'utf8')));
const used = iconNames();

const missing = used.filter((name) => !inFont.has(name));
const spare = [...inFont].filter((name) => !used.includes(name));

if (missing.length) {
  console.error(`Icons used but not in the font: ${missing.join(', ')}`);
  console.error('Run "npm run icons:build" to cut a new font, then commit it.');
  process.exit(1);
}
if (spare.length) {
  console.error(`Icons in the font that nothing draws: ${spare.join(', ')}`);
  console.error('Run "npm run icons:build" to cut a smaller font, then commit it.');
  process.exit(1);
}
console.log(`Icon check passed (${used.length} icons)`);
