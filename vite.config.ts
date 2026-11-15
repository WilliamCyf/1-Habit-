import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  // Relative base: the built site works no matter which folder it is hosted
  // in (GitHub Pages serves it from /1-Habit-/, not from the site root).
  base: './',
  plugins: [cspPlugin()],
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
