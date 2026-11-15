// A tiny helper for building page elements from code.
//
// h('button', { class: 'btn', onclick: save }, 'Save') creates
// <button class="btn">Save</button> and wires up the tap. It is the only
// "framework" this app uses: about 40 lines instead of a 40 KB library.

type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  class?: string;
  /** Trusted markup only (our own SVG art). Never user-typed text. */
  html?: string;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = String(value);
      else if (key === 'html') node.innerHTML = String(value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Slide-and-fade an element in. Uses the Web Animations API with only
 * transform and opacity, which the graphics chip can do without the page
 * having to re-measure anything.
 */
export function animateIn(node: HTMLElement, from: 'right' | 'left' | 'up' = 'right'): void {
  if (reducedMotion() || typeof node.animate !== 'function') return;
  const start = from === 'right' ? 'translateX(28px)' : from === 'left' ? 'translateX(-28px)' : 'translateY(18px)';
  node.animate(
    [
      { opacity: 0, transform: start },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.1)' },
  );
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}
