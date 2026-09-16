// tsc does not emit hand-placed declaration files, so the generated schema types are
// copied next to the compiled output where dist/index.d.ts re-exports them from.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/schema.d.ts', import.meta.url), new URL('../dist/schema.d.ts', import.meta.url));
console.log('Copied src/schema.d.ts to dist/schema.d.ts');
