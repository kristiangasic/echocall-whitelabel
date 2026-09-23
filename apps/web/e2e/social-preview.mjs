// Renders docs/images/social-preview.png, the 1280x640 card GitHub shows when the
// repository link is shared. The template is docs/images/social-preview.html and
// embeds the screenshots next to it (npm run screenshots regenerates those).
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const images = resolve(here, '../../../docs/images');
const out = resolve(images, 'social-preview.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(images, 'social-preview.html')).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1280, height: 640 } });
await browser.close();
console.log(`${out} (${Math.round(statSync(out).size / 1024)} KB, 2560x1280)`);
