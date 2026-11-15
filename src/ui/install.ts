// "Add to Home Screen" guide. iOS never shows an automatic install prompt,
// so the app has to explain the steps itself.
import { browserName, isStandalone } from '../platform/ios';
import { icon, openSheet, button } from './components';
import { h } from './dom';

/** The three steps, as a reusable block. */
export function installSteps(): HTMLElement {
  const notSafari = browserName() !== 'Safari' && browserName() !== 'Other';
  return h(
    'div',
    { class: 'stack' },
    notSafari
      ? h(
          'p',
          { class: 'notice' },
          `You are using ${browserName()}. For the best result, open this page in Safari first, then follow these steps.`,
        )
      : null,
    h(
      'ol',
      { class: 'steps' },
      h('li', null, h('span', { class: 'step-icon' }, icon('share')), h('span', null, 'Tap the ', h('strong', null, 'Share'), ' button in Safari’s toolbar.')),
      h(
        'li',
        null,
        h('span', { class: 'step-icon' }, icon('addSquare')),
        h('span', null, 'Scroll down and tap ', h('strong', null, 'Add to Home Screen'), '.'),
      ),
      h('li', null, h('span', { class: 'step-icon' }, icon('check')), h('span', null, 'Tap ', h('strong', null, 'Add'), '. Then open Repling from its new icon.')),
    ),
    h('p', { class: 'muted small' }, 'From the Home Screen, Repling opens full-screen and works without internet.'),
  );
}

export function openInstallSheet(): void {
  openSheet('Add to Home Screen', (sheet) =>
    h('div', { class: 'stack' }, installSteps(), button('Done', { block: true, onClick: () => sheet.close() })),
  );
}

export { isStandalone };
