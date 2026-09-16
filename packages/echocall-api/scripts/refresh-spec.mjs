// Downloads the current public OpenAPI document of the hub into spec/openapi.json.
// Run `npm run generate` afterwards to refresh the generated types.
import { writeFileSync } from 'node:fs';

const url = process.env.ECHOCALL_OPENAPI_URL ?? 'https://hub.echocall.de/api/v1/docs/openapi.json';
const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();
writeFileSync(new URL('../spec/openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log(`Saved ${url} (version ${spec.info?.version}) with ${Object.keys(spec.paths).length} paths`);
