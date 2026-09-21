// Downloads the current public OpenAPI document of the hub into spec/openapi.json.
// Run `npm run generate` afterwards to refresh the generated types.
//
// The download is checked against the document already in the repository before
// it replaces it. A service that answers this path from a stale file hands out
// an older spec than the one vendored here, and writing that over the current
// one would silently drop endpoints from the generated client. Set
// ECHOCALL_ALLOW_SPEC_DOWNGRADE=1 to write it anyway, which is what a deliberate
// pin to an older service needs.
import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../spec/openapi.json', import.meta.url);
const url = process.env.ECHOCALL_OPENAPI_URL ?? 'https://hub.echocall.de/api/v1/docs/openapi.json';

const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();
if (!spec?.paths || typeof spec.paths !== 'object') {
  console.error(`${url} did not answer with an OpenAPI document`);
  process.exit(1);
}

const downloaded = Object.keys(spec.paths).length;
let current = null;
try {
  current = JSON.parse(readFileSync(target, 'utf8'));
} catch {
  // No vendored document yet: nothing to compare against.
}

if (current?.paths && !process.env.ECHOCALL_ALLOW_SPEC_DOWNGRADE) {
  const missing = Object.keys(current.paths).filter((path) => !(path in spec.paths));
  if (missing.length > 0) {
    console.error(
      `Refusing to write ${url}: it is missing ${missing.length} path(s) the vendored document has.`,
    );
    console.error(`  vendored: version ${current.info?.version}, ${Object.keys(current.paths).length} paths`);
    console.error(`  download: version ${spec.info?.version}, ${downloaded} paths`);
    console.error(`  missing:  ${missing.join(', ')}`);
    console.error('The service is probably answering this path from an outdated file. Check the service, or');
    console.error('set ECHOCALL_ALLOW_SPEC_DOWNGRADE=1 if an older document is really what you want.');
    process.exit(1);
  }
}

writeFileSync(target, JSON.stringify(spec, null, 2) + '\n');
console.log(`Saved ${url} (version ${spec.info?.version}) with ${downloaded} paths`);
