// Boot file: the first code that runs when Repling opens.
// It loads the saved data, picks the colour theme, decides which screen to
// show, and switches on offline support.
import { getState, initStore, onWriteProblem, subscribe } from './store';
import { requestPersistence } from '../platform/storage';
import { toast } from '../ui/components';
import { renderHome } from '../ui/home';
import { renderOnboarding } from '../ui/onboarding';

const root = document.getElementById('app')!;
const loadNote = initStore();

// ------------------------------------------------------------------ theme

const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

function applyTheme(): void {
  const choice = getState().settings.theme;
  const theme = choice === 'system' ? (lightQuery.matches ? 'light' : 'dark') : choice;
  document.documentElement.dataset.theme = theme;
  // Colour of the iPhone status bar area, to match the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f7f2' : '#0d1512');
}
lightQuery.addEventListener('change', applyTheme);

// ----------------------------------------------------------------- screens

let redrawHome: (() => void) | null = null;
let showingHome: boolean | null = null;

function mount(): void {
  const done = getState().onboardingDone && getState().profile !== null;
  showingHome = done;
  if (done) {
    redrawHome = renderHome(root);
    void requestPersistence();
    askWorkerToFetchTracker();
  } else {
    redrawHome = null;
    renderOnboarding(root, mount);
  }
}

subscribe(() => {
  applyTheme();
  const done = getState().onboardingDone && getState().profile !== null;
  // Switch screens if onboarding just finished or the data was erased.
  if (done !== showingHome) mount();
  else redrawHome?.();
});

// Coming back to the app after a while: time has passed for the pet and the
// garden, so redraw the screen from the current clock. (No timers needed.)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) redrawHome?.();
});

// ----------------------------------------------------------------- offline
// A service worker is a small helper script the browser keeps running
// beside the app. Ours keeps a copy of the app's files on the phone, so it
// opens with no internet. See src/sw/sw.js.

function askWorkerToFetchTracker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Download the 17 MB tracking engine in the background, so the first
  // workout does not have to wait for it and it works offline later.
  void navigator.serviceWorker.ready.then((reg) => {
    window.setTimeout(() => reg.active?.postMessage({ type: 'prefetch-heavy' }), 3000);
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadWorker = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A newer version of the app just took over. Reload once to use it.
    // (Skipped on the very first visit, when there was nothing to replace.)
    if (!hadWorker || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support could not start:', err));
  });
}

// -------------------------------------------------------------------- boot

applyTheme();
mount();

onWriteProblem((kind) => {
  toast(
    kind === 'full'
      ? 'This phone’s storage is full, so progress cannot be saved right now.'
      : 'Storage is blocked (Private Browsing?). Progress will not be saved.',
    6000,
  );
});

if (loadNote === 'recovered') toast('Your save was damaged, so I restored the last good copy.', 5000);
else if (loadNote === 'reset') toast('Your saved data could not be read, so we are starting fresh.', 5000);
else if (loadNote === 'too-new') toast('This save is from a newer version of Repling. Reload to update the app.', 8000);
