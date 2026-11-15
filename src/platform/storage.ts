// A careful wrapper around the phone's built-in storage ("localStorage": a
// small notebook the browser keeps for each website).
//
// iOS can be strict: storage may be full, switched off (Private Browsing),
// or cleared for sites you have not opened in a while. So every read and
// write here is wrapped in try/catch ("try this, and if it blows up, do
// that instead") and reports what happened rather than crashing.

export type WriteResult = 'ok' | 'full' | 'blocked';

export function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKey(key: string, value: string): WriteResult {
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return name === 'QuotaExceededError' ? 'full' : 'blocked';
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}

export type Persistence = 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser to protect our data from automatic clean-up.
 * On iOS this is usually granted for apps added to the Home Screen.
 */
export async function requestPersistence(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function storageUsage(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usedMb: usage / 1048576, quotaMb: quota / 1048576 };
  } catch {
    return null;
  }
}
