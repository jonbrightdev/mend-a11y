// Guards the vision-simulation lib: each mode builds a filter with the expected
// id and primitives in the intended colour space, and the injected apply/remove
// pair inserts and tears down the defs and style cleanly and idempotently.
// Run with: tsx test/vision.test.ts
import {
  VISION_DEFS_ID,
  VISION_FILTER_ID,
  VISION_LABELS,
  VISION_MODES,
  VISION_STYLE_ID,
  applyVisionInPage,
  isVisionActiveInPage,
  removeVisionInPage,
  visionMarkup,
} from '../src/lib/vision';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

const valuesOf = (svg: string): string => svg.match(/values="([^"]*)"/)?.[1] ?? '';

// --- Markup checks (no DOM needed) ---
ok('five modes', VISION_MODES.length === 5);
ok(
  'every mode has a label',
  VISION_MODES.every((m) => typeof VISION_LABELS[m] === 'string' && VISION_LABELS[m].length > 0),
);

for (const mode of VISION_MODES) {
  const { svg, css } = visionMarkup(mode);
  ok(`${mode}: filter has the shared id`, svg.includes(`id="${VISION_FILTER_ID}"`));
  ok(`${mode}: css points the root at the filter`, css.includes(`url(#${VISION_FILTER_ID})`));
}

for (const mode of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const) {
  const { svg } = visionMarkup(mode);
  ok(`${mode}: uses feColorMatrix`, svg.includes('<feColorMatrix'));
  ok(`${mode}: evaluated in linearRGB`, svg.includes('color-interpolation-filters="linearRGB"'));
  ok(`${mode}: matrix expands to 20 values`, valuesOf(svg).trim().split(/\s+/).length === 20);
}

ok(
  'achromatopsia: rows share the Rec.709 luma weights',
  valuesOf(visionMarkup('achromatopsia').svg).includes(
    '0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722',
  ),
);

const low = visionMarkup('lowVision').svg;
ok('lowVision: uses a Gaussian blur', low.includes('<feGaussianBlur'));
ok('lowVision: blur radius is 2.2', low.includes('stdDeviation="2.2"'));
ok('lowVision: evaluated in sRGB', low.includes('color-interpolation-filters="sRGB"'));
ok('lowVision: reduces contrast', low.includes('<feComponentTransfer'));

// --- Minimal DOM stub for apply/remove (no jsdom) ---
const byId: Record<string, El> = {};
const register = (el: El) => {
  if (el.id) byId[el.id] = el;
};
const unregister = (el: El) => {
  if (el.id && byId[el.id] === el) delete byId[el.id];
};

class El {
  tagName: string;
  id = '';
  textContent = '';
  children: El[] = [];
  parent: El | null = null;
  private _html = '';

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  set innerHTML(v: string) {
    this._html = v;
    // The real parser would build the SVG subtree; one placeholder child is
    // enough to exercise firstElementChild + appendChild here.
    this.children = v ? [new El('svg')] : [];
  }
  get innerHTML(): string {
    return this._html;
  }
  get firstElementChild(): El | null {
    return this.children[0] ?? null;
  }
  appendChild(c: El): El {
    c.parent = this;
    this.children.push(c);
    register(c);
    return c;
  }
  remove(): void {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
    unregister(this);
  }
}

const documentElement = new El('html');
const head = new El('head');
(globalThis as unknown as { document: unknown }).document = {
  documentElement,
  head,
  createElement: (tag: string) => new El(tag),
  getElementById: (id: string) => byId[id] ?? null,
};

const m = visionMarkup('deuteranopia');
applyVisionInPage(m.svg, m.css, VISION_DEFS_ID, VISION_STYLE_ID);
ok('apply: defs element inserted', byId[VISION_DEFS_ID] != null);
ok('apply: style element inserted', byId[VISION_STYLE_ID] != null);
ok('apply: reported active', isVisionActiveInPage(VISION_STYLE_ID) === true);
ok('apply: style carries the filter css', byId[VISION_STYLE_ID]?.textContent.includes(VISION_FILTER_ID) === true);

// Re-apply a different mode: idempotent, no duplicate nodes.
const m2 = visionMarkup('lowVision');
applyVisionInPage(m2.svg, m2.css, VISION_DEFS_ID, VISION_STYLE_ID);
ok('re-apply: one defs node on the root', documentElement.children.length === 1);
ok('re-apply: one style node in the head', head.children.length === 1);

removeVisionInPage(VISION_DEFS_ID, VISION_STYLE_ID);
ok('remove: defs gone', byId[VISION_DEFS_ID] == null);
ok('remove: style gone', byId[VISION_STYLE_ID] == null);
ok('remove: reported inactive', isVisionActiveInPage(VISION_STYLE_ID) === false);
ok('remove: nothing left on the root', documentElement.children.length === 0);

let removedTwiceSafely = true;
try {
  removeVisionInPage(VISION_DEFS_ID, VISION_STYLE_ID);
} catch {
  removedTwiceSafely = false;
}
ok('remove when absent is safe', removedTwiceSafely);

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
