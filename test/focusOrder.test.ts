// Guards the focus-order visualizer: the overlay computes the correct tab-order
// sequence (positive tabindex first, then DOM order; negative/hidden skipped),
// draws one numbered badge plus a ring per stop, is idempotent, and clears
// cleanly. Run with: tsx test/focusOrder.test.ts
import {
  showFocusOrderInPage,
  clearFocusOrderInPage,
  isFocusOrderActiveInPage,
  FOCUS_ORDER_ACCENT,
} from '../src/lib/focusOrder';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

ok('accent is the rust token', FOCUS_ORDER_ACCENT === '#c4502c');

// --- Minimal DOM stub (no jsdom), enough to run the injected function. ---
type Rect = { top: number; left: number; width: number; height: number };

class El {
  style: Record<string, string> = {};
  textContent = '';
  children: El[] = [];
  parent: El | null = null;
  hidden = false;
  disabled = false;
  rect: Rect = { top: 0, left: 0, width: 10, height: 10 };
  private attrs: Record<string, string> = {};
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  getAttribute(k: string): string | null {
    return k in this.attrs ? this.attrs[k]! : null;
  }
  getBoundingClientRect(): Rect {
    return this.rect;
  }
  closest(_sel: string): El | null {
    return null;
  }
  appendChild(c: El): El {
    if (c.parent) {
      const j = c.parent.children.indexOf(c);
      if (j >= 0) c.parent.children.splice(j, 1);
    }
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove(): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
}

// A focusable element with a given tabindex and a unique top, so each badge's
// position identifies which element it belongs to.
function focusable(tabindex: string | null, top: number, hidden = false): El {
  const el = new El();
  if (tabindex != null) el.setAttribute('tabindex', tabindex);
  el.rect = { top, left: 0, width: 10, height: 10 };
  el.hidden = hidden;
  return el;
}

const A = focusable(null, 0); // implicit tabindex 0, DOM #0
const B = focusable('2', 100); // tabindex 2,        DOM #1
const C = focusable('1', 200); // tabindex 1,        DOM #2
const D = focusable('-1', 300); // tabindex -1  -> excluded
const E = focusable('0', 400); // explicit tabindex 0, DOM #4
const F = focusable(null, 500, true); // hidden     -> excluded
const nodes = [A, B, C, D, E, F];

const body = new El();
const removedListeners: string[] = [];
const addedListeners: Record<string, number> = {};

const win = {
  __mendFocusOrder: undefined as unknown,
  scrollX: 0,
  scrollY: 0,
  getComputedStyle: (_el: El) => ({ visibility: 'visible', display: 'block' }),
  addEventListener: (type: string) => {
    addedListeners[type] = (addedListeners[type] ?? 0) + 1;
  },
  removeEventListener: (type: string) => {
    removedListeners.push(type);
  },
};

const doc = {
  body,
  documentElement: body,
  createElement: (_tag: string) => new El(),
  querySelectorAll: (_sel: string) => nodes,
};

(globalThis as unknown as { window: unknown }).window = win;
(globalThis as unknown as { document: unknown }).document = doc;
(globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (
  cb: () => void,
) => {
  void cb;
  return 0;
};

ok('not active before showing', isFocusOrderActiveInPage() === false);

showFocusOrderInPage(FOCUS_ORDER_ACCENT);
ok('active after showing', isFocusOrderActiveInPage() === true);
ok('one overlay container appended', body.children.length === 1);

const container = body.children[0]!;
const badges = container.children.filter((c) => /^\d+$/.test(c.textContent));
const rings = container.children.filter((c) => c.textContent === '');

// D (tabindex -1) and F (hidden) are excluded -> 4 stops.
ok('four stops badged', badges.length === 4);
ok('four rings drawn', rings.length === 4);
ok('a badge and a ring per stop', container.children.length === 8);

// Order: positive tabindex first, ascending (C=1 @top200, B=2 @top100), then
// tabindex 0 in DOM order (A @top0, E @top400). Each badge's top identifies it.
const seq = badges.map((b) => `${b.textContent}@${b.style.top}`);
ok('stop 1 is C (tabindex 1)', seq.includes('1@200px'));
ok('stop 2 is B (tabindex 2)', seq.includes('2@100px'));
ok('stop 3 is A (DOM order, tabindex 0)', seq.includes('3@0px'));
ok('stop 4 is E (DOM order, tabindex 0)', seq.includes('4@400px'));
ok('a resize listener was registered', (addedListeners['resize'] ?? 0) >= 1);

// Idempotent: re-show rebuilds in place with no duplicate container, and the
// previous resize listener is removed first.
showFocusOrderInPage(FOCUS_ORDER_ACCENT);
ok('still one container after re-show', body.children.length === 1);
ok('still eight overlay nodes after re-show', body.children[0]!.children.length === 8);
ok('prior resize listener removed on re-show', removedListeners.includes('resize'));

clearFocusOrderInPage();
ok('inactive after clear', isFocusOrderActiveInPage() === false);
ok('container removed on clear', body.children.length === 0);

let threw = false;
try {
  clearFocusOrderInPage();
} catch {
  threw = true;
}
ok('clear when absent is safe', threw === false);

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
