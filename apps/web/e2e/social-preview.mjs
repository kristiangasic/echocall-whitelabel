// Renders docs/images/social-preview.png, the 1280x640 card GitHub shows when the
// repository link is shared. The template is docs/images/social-preview.html; the
// portal screenshot inside it is docs/images/admin-overview.png (npm run screenshots).
import { chromium } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const images = resolve(here, '../../../docs/images');
const template = readFileSync(resolve(images, 'social-preview.html'), 'utf8');
const shot = readFileSync(resolve(images, 'admin-overview.png')).toString('base64');
const out = resolve(images, 'social-preview.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
await page.setContent(template.replace('SHOT_SRC', 'data:image/png;base64,' + shot), { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1280, height: 640 } });
await browser.close();
console.log(`${out} (${Math.round(statSync(out).size / 1024)} KB, 2560x1280)`);
