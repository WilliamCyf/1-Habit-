// Draws public/og.png: the picture shown when the app's link is shared in
// a message or on social media. Run with: npm run og
// Needs Playwright, like make-icons.mjs.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mascot = readFileSync(join(root, 'public/icons/mascot.svg'), 'utf8');

const html = `<style>
  html,body{margin:0}
  body{width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;
    background:radial-gradient(900px 600px at 28% 45%,#245240,#12261d 60%,#0a120e);
    font-family:ui-rounded,-apple-system,"Helvetica Neue",Arial,sans-serif;color:#eef6f0}
  .art{width:340px;height:340px;border-radius:80px;overflow:hidden;flex:none;box-shadow:0 30px 80px rgba(124,242,176,.18)}
  .art svg{width:100%;height:100%;display:block}
  h1{font-size:112px;margin:0;font-weight:800;letter-spacing:-3px}
  p{font-size:42px;margin:14px 0 0;color:#9fb3a8;line-height:1.25;font-weight:600}
  b{color:#7cf2b0}
</style>
<div class="art">${mascot}</div>
<div><h1>Repling</h1><p>Real reps, <b>counted by your camera</b>,<br>grow a little world.</p></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
writeFileSync(join(root, 'public/og.png'), await page.screenshot({ type: 'png' }));
await browser.close();
console.log('wrote public/og.png (1200x630)');
