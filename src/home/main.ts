// Landing screen (temporary until the real app shell arrives in Milestone 1).
import { isStandalone } from '../platform/ios';

// If the app was opened from the Home Screen icon, the "how to install"
// instructions are pointless, so swap them for a small confirmation.
if (isStandalone()) {
  document.getElementById('install')?.setAttribute('hidden', '');
  document.getElementById('installed')?.removeAttribute('hidden');
}
