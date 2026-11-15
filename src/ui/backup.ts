// Export and import of the save file, so data survives a new phone or a
// cleared browser.
import { getState, replaceAll } from '../app/store';
import { BACKUP_ERRORS, makeBackup, readBackup } from '../state/save';
import { confirmSheet, toast } from './components';

function fileName(now: Date): string {
  return `repling-backup-${now.toISOString().slice(0, 10)}.json`;
}

export async function exportBackup(): Promise<void> {
  const now = new Date();
  const text = makeBackup(getState(), now);
  const name = fileName(now);

  // Best on iPhone: the share sheet, which offers "Save to Files".
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Repling backup' });
      toast('Backup shared. Keep the file somewhere safe.');
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return; // user closed the sheet
  }

  // Fallback: an ordinary download.
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Backup saved to your downloads.');
  } catch {
    toast('Could not save a backup on this device.');
  }
}

export function importBackup(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast('That file could not be read.');
      return;
    }
    const result = readBackup(text);
    if (!result.ok) {
      toast(BACKUP_ERRORS[result.reason], 4500);
      return;
    }
    const when = new Date(result.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const yes = await confirmSheet({
      title: 'Restore this backup?',
      message: `This replaces everything on this phone with the backup from ${when}. This cannot be undone.`,
      confirm: 'Replace my data',
      danger: true,
    });
    if (!yes) return;
    replaceAll(result.data);
    toast('Backup restored.');
  });
  input.click();
}
