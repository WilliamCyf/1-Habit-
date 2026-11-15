// Small helpers for iPhone-specific behaviour.

/**
 * True when the app was opened from the Home Screen icon (full-screen,
 * no Safari address bar). Apple calls this "standalone" mode.
 */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Screen Wake Lock: asks iOS not to dim and lock the screen, like pressing
 * "stay awake" during a workout. iOS can refuse (Low Power Mode) or release
 * it when the app goes to the background, so we treat it as best-effort.
 */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  /** 'active' | 'released' | 'unsupported' | 'refused' */
  state: 'active' | 'released' | 'unsupported' | 'refused' = 'released';
  /** Why the last request was refused, if it was. */
  lastError: string | null = null;

  get supported(): boolean {
    return 'wakeLock' in navigator;
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    if (!this.supported) {
      this.state = 'unsupported';
      return;
    }
    if (this.sentinel) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      this.sentinel = sentinel;
      this.state = 'active';
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        if (this.state === 'active') this.state = 'released';
      });
      // If release() was called while we were waiting, honour it now.
      if (!this.wanted) void this.release();
      this.lastError = null;
    } catch (err) {
      this.state = 'refused';
      this.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    const s = this.sentinel;
    this.sentinel = null;
    this.state = this.supported ? 'released' : 'unsupported';
    if (s) {
      try {
        await s.release();
      } catch {
        /* already released by the system: nothing to do */
      }
    }
  }
}

/**
 * Which browser app is showing the page. On iPhone every browser uses
 * Apple's engine underneath, but only Safari gets every feature, so it is
 * worth knowing. Each browser adds its own tag to the "user agent" (the
 * name badge a browser shows to websites).
 */
export function browserName(userAgent: string = navigator.userAgent): 'Safari' | 'Chrome' | 'Firefox' | 'Edge' | 'Other' {
  if (/CriOS/.test(userAgent)) return 'Chrome';
  if (/FxiOS/.test(userAgent)) return 'Firefox';
  if (/EdgiOS/.test(userAgent)) return 'Edge';
  if (/Safari/.test(userAgent) && /iPhone|iPad|Macintosh/.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) {
    return 'Safari';
  }
  return 'Other';
}

export interface DeviceSummary {
  userAgent: string;
  browser: string;
  screen: string;
  viewport: string;
  pixelRatio: number;
  standalone: boolean;
  cores: number | null;
  language: string;
  online: boolean;
}

export function deviceSummary(): DeviceSummary {
  return {
    userAgent: navigator.userAgent,
    browser: browserName(),
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: window.devicePixelRatio || 1,
    standalone: isStandalone(),
    cores: navigator.hardwareConcurrency ?? null,
    language: navigator.language,
    online: navigator.onLine,
  };
}

/** Name of the graphics chip as the browser reports it (often just "Apple GPU"). */
export function gpuName(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    const version = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1';
    // Free the graphics context straight away; iOS limits how many can exist.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return `${name} (${version})`;
  } catch {
    return 'unknown';
  }
}
