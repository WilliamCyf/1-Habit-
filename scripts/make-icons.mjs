// Turns public/icons/icon.svg into the PNG files iOS needs for the Home
// Screen icon. iOS does not accept SVG for "apple-touch-icon", so we
// "rasterise" it: paint the drawing into a grid of pixels at fixed sizes.
//
// Run with: npm run icons   (only needed again if icon.svg changes)
// Needs Playwright (a tool that drives a real browser) to do the painting.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'icon-1024.png': 1024 };

const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  writeFileSync(join(dir, name), await page.screenshot({ type: 'png' }));
  await page.close();
  console.log(`wrote ${name} (${size}x${size})`);
}
await browser.close();
