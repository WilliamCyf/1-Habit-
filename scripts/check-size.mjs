// A guard run by the publish robot: fail if the app's own code grows past
// its budget. Small apps load fast and keep the phone cool.
//
// "App code" = our scripts and styles. Not counted: the tracking engine and
// model, which are large, downloaded once, and kept on the phone.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 300;
const dir = 'dist/assets';
let total = 0;
const rows = [];
for (const name of readdirSync(dir)) {
  if (name.startsWith('vision_bundle')) continue; // the tracking library
  if (!/\.(js|css)$/.test(name)) continue;
  const kb = statSync(join(dir, name)).size / 1024;
  total += kb;
  rows.push(`${kb.toFixed(1).padStart(7)} KB  ${name}`);
}
console.log(rows.sort().reverse().join('\n'));
console.log(`${total.toFixed(1).padStart(7)} KB  total app code (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) {
  console.error(`App code is over budget by ${(total - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
