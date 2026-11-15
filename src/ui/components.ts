// Reusable building blocks: buttons, choice cards, chips, number boxes,
// pop-up sheets and toasts. Screens are assembled from these, like Lego.
import { animateIn, h, reducedMotion } from './dom';
import { icons, type IconName } from './icons';

export function icon(name: IconName, className = 'icon'): HTMLElement {
  return h('span', { class: className, html: icons[name] });
}

export interface ButtonOptions {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  onClick?: () => void;
  href?: string;
  block?: boolean;
}

export function button(label: string, opts: ButtonOptions = {}): HTMLElement {
  const cls = `btn ${opts.variant && opts.variant !== 'primary' ? opts.variant : ''} ${opts.block ? 'block' : ''}`.trim();
  const kids = [opts.icon ? icon(opts.icon) : null, h('span', null, label)];
  if (opts.href) return h('a', { class: cls, href: opts.href }, ...kids);
  return h('button', { class: cls, type: 'button', onclick: opts.onClick }, ...kids);
}

// ------------------------------------------------------------ single choice

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  sub?: string;
  icon?: IconName;
}

/** Big tappable cards where exactly one can be picked (a radio group). */
export function choiceCards<T extends string | number>(
  label: string,
  choices: readonly Choice<T>[],
  selected: T | undefined,
  onPick: (value: T) => void,
): HTMLElement {
  const group = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': label });
  const cards = choices.map((c) => {
    const card = h(
      'button',
      {
        class: 'choice',
        type: 'button',
        role: 'radio',
        'aria-checked': String(c.value === selected),
        onclick: () => {
          for (const other of cards) other.setAttribute('aria-checked', String(other === card));
          onPick(c.value);
        },
      },
      c.icon ? icon(c.icon, 'icon choice-icon') : null,
      h('span', { class: 'choice-text' }, h('strong', null, c.label), c.sub ? h('small', null, c.sub) : null),
      icon('check', 'icon choice-tick'),
    );
    return card;
  });
  group.append(...cards);
  return group;
}

/** A row of pills. Single-select by default, multi-select if asked. */
export function chips<T extends string | number>(
  label: string,
  choices: readonly Choice<T>[],
  selected: readonly T[],
  onChange: (values: T[]) => void,
  opts: { multi?: boolean } = {},
): HTMLElement {
  let current = [...selected];
  const group = h('div', { class: 'chips', role: opts.multi ? 'group' : 'radiogroup', 'aria-label': label });
  const sync = () => {
    pills.forEach((pill, i) => {
      const on = current.includes(choices[i]!.value);
      pill.setAttribute(opts.multi ? 'aria-pressed' : 'aria-checked', String(on));
    });
  };
  const pills = choices.map((c) =>
    h(
      'button',
      {
        class: 'chip-btn',
        type: 'button',
        role: opts.multi ? undefined : 'radio',
        onclick: () => {
          if (opts.multi) current = current.includes(c.value) ? current.filter((v) => v !== c.value) : [...current, c.value];
          else current = [c.value];
          sync();
          onChange(current);
        },
      },
      c.label,
    ),
  );
  group.append(...pills);
  sync();
  return group;
}

/** A two-or-three way switch, like the iOS segmented control. */
export function segmented<T extends string>(
  label: string,
  choices: readonly Choice<T>[],
  selected: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const parts = choices.map((c) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': String(c.value === selected),
        onclick: () => {
          for (const p of parts) p.setAttribute('aria-checked', String(p === part(c.value)));
          onChange(c.value);
        },
      },
      c.label,
    ),
  );
  const part = (value: T) => parts[choices.findIndex((c) => c.value === value)];
  group.append(...parts);
  return group;
}

// ------------------------------------------------------------- number input

export interface NumberFieldOptions {
  label: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  /** Allow one decimal place (weight) or whole numbers only (age). */
  decimal?: boolean;
  onChange: (value: number | undefined) => void;
}

export function numberField(opts: NumberFieldOptions): HTMLElement {
  const input = h('input', {
    class: 'num-input',
    // "text" with a numeric keyboard avoids the quirks of type=number on iOS
    // (silent rejection of commas, tiny spinner arrows).
    type: 'text',
    inputmode: opts.decimal ? 'decimal' : 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': `${opts.label} in ${opts.unit}`,
    value: opts.value === undefined ? '' : String(opts.value),
  });
  const hint = h('small', { class: 'field-hint' });
  const wrap = h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, opts.label),
    h('span', { class: 'num-box' }, input, h('span', { class: 'num-unit' }, opts.unit)),
    hint,
  );
  const check = () => {
    // Accept a comma as a decimal point, as many keyboards type one.
    const text = input.value.trim().replace(',', '.');
    const value = text === '' ? NaN : Number(text);
    const valid = Number.isFinite(value) && value >= opts.min && value <= opts.max && (opts.decimal || Number.isInteger(value));
    const showError = text !== '' && !valid;
    wrap.classList.toggle('invalid', showError);
    hint.textContent = showError ? `Enter a number from ${opts.min} to ${opts.max}` : '';
    opts.onChange(valid ? value : undefined);
  };
  input.addEventListener('input', check);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  return wrap;
}

// -------------------------------------------------------------------- toast

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

export function toast(message: string, ms = 3000): void {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  // Reading offsetWidth forces the browser to notice the element before we
  // add the class, so the slide-in animation actually plays.
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), ms);
}

// -------------------------------------------------------------------- sheet

export interface SheetHandle {
  close(): void;
}

/**
 * A panel that slides up from the bottom, over a dimmed page. Used for
 * anything that would be a "pop-up window" on a computer.
 */
export function openSheet(title: string, build: (sheet: SheetHandle) => HTMLElement): SheetHandle {
  const previousFocus = document.activeElement as HTMLElement | null;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let closed = false;

  const handle: SheetHandle = {
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      const done = () => {
        backdrop.remove();
        previousFocus?.focus?.();
      };
      if (reducedMotion() || typeof panel.animate !== 'function') return done();
      backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      panel
        .animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
        .finished.then(done, done);
    },
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') handle.close();
  };

  panel.append(
    h(
      'header',
      { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => handle.close() }, icon('close')),
    ),
    h('div', { class: 'sheet-body' }, build(handle)),
  );
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) handle.close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  if (!reducedMotion() && typeof panel.animate === 'function') {
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    panel.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], {
      duration: 340,
      easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.05)',
    });
  }
  return handle;
}

/** A yes/no question in a sheet. Resolves true only if the user confirms. */
export function confirmSheet(opts: { title: string; message: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet(opts.title, (s) =>
      h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, opts.message),
        button(opts.confirm, {
          variant: opts.danger ? 'danger' : 'primary',
          block: true,
          onClick: () => {
            answer = true;
            s.close();
          },
        }),
        button('Cancel', { variant: 'ghost', block: true, onClick: () => s.close() }),
      ),
    );
    // Whichever way the sheet closes, report the answer once.
    const original = sheet.close;
    sheet.close = () => {
      original();
      resolve(answer);
    };
  });
}

/** Coach speech bubble: Pip on the left, words on the right. */
export function coachSays(svg: string, text: string): HTMLElement {
  const row = h('div', { class: 'coach' }, h('div', { class: 'coach-pip', html: svg }), h('p', { class: 'bubble' }, text));
  animateIn(row, 'up');
  return row;
}

/** A stacked fraction: top over a line over bottom. */
export function fraction(top: string, bottom: string): HTMLElement {
  return h(
    'span',
    { class: 'frac', role: 'math', 'aria-label': `${top} divided by ${bottom}` },
    h('span', null, top),
    h('span', null, bottom),
  );
}
