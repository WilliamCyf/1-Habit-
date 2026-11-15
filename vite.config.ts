import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// Content-Security-Policy: a rulebook the browser enforces for this page.
// `connect-src 'self'` means the page may only talk to its own website, so
// even a buggy or nosy library physically cannot send data anywhere else.
// We only add it to the real build, because the dev server needs looser rules.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'repling-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function fingerprint(files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(readFileSync(file));
  return hash.digest('hex').slice(0, 12);
}

/**
 * After the build, write dist/sw.js (the offline helper) with the exact
 * list of files to store on the phone. The version is a fingerprint of the
 * files, so it changes automatically whenever anything in the app changes.
 */
function serviceWorkerPlugin(): Plugin {
  const HEAVY = ['wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'models/pose_landmarker_lite.task'];
  // Too big, and not needed offline: only used for Home Screen artwork.
  const SKIP = new Set(['sw.js', 'icons/icon-1024.png', 'icons/icon-512.png']);
  return {
    name: 'repling-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const all = listFiles(dist).sort();
      const rel = (f: string) => relative(dist, f).split('\\').join('/');
      const shellFiles = all.filter((f) => {
        const r = rel(f);
        return !SKIP.has(r) && !r.startsWith('wasm/') && !r.startsWith('models/');
      });
      const shell = ['./', ...shellFiles.map(rel)];
      const sw = readFileSync('src/sw/sw.js', 'utf8')
        .replace('__VERSION__', fingerprint(shellFiles))
        .replace('__HEAVY_VERSION__', fingerprint(HEAVY.map((f) => join(dist, f))))
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__HEAVY__', JSON.stringify(HEAVY));
      writeFileSync(join(dist, 'sw.js'), sw);
      console.log(`service worker: ${shell.length} app files listed for offline use`);
    },
  };
}

export default defineConfig({
  // Relative base: the built site works no matter which folder it is hosted
  // in (GitHub Pages serves it from /1-Habit-/, not from the site root).
  base: './',
  plugins: [cspPlugin(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'safari17',
    rollupOptions: {
      input: {
        main: 'index.html',
        diag: 'diag.html',
      },
    },
  },
});
