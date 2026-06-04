// Guards the WCAG 1.4.12 text-spacing emulation: the normative values must be
// present in the injected CSS, and apply/remove must be idempotent and clean.
// Run with: tsx test/textSpacing.test.ts
import {
  TEXT_SPACING_CSS,
  TEXT_SPACING_STYLE_ID,
  applyTextSpacingInPage,
  removeTextSpacingInPage,
  isTextSpacingActiveInPage,
} from '../src/lib/textSpacing';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// Normative values from W3C SC 1.4.12.
ok('line height is 1.5', /line-height:\s*1\.5\s*!important/.test(TEXT_SPACING_CSS));
ok('letter spacing is 0.12em', /letter-spacing:\s*0\.12em\s*!important/.test(TEXT_SPACING_CSS));
ok('word spacing is 0.16em', /word-spacing:\s*0\.16em\s*!important/.test(TEXT_SPACING_CSS));
ok('paragraph spacing is 2em', /margin-bottom:\s*2em\s*!important/.test(TEXT_SPACING_CSS));
ok('targets paragraphs for spacing', /\bp\s*\{/.test(TEXT_SPACING_CSS));
ok('applies broadly with universal selector', /\*/.test(TEXT_SPACING_CSS));

// Minimal DOM stub so the injected functions can run under tsx (no jsdom).
class FakeElement {
  id = '';
  textContent = '';
  private attrs: Record<string, string> = {};
  parentNode: FakeHead | null = null;
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  remove(): void {
    if (this.parentNode) this.parentNode._remove(this);
  }
}
class FakeHead {
  children: FakeElement[] = [];
  appendChild(el: FakeElement): FakeElement {
    // Re-appending an existing node moves it to the end (matches DOM).
    this._remove(el);
    el.parentNode = this;
    this.children.push(el);
    return el;
  }
  _remove(el: FakeElement): void {
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
  }
}
const head = new FakeHead();
const doc = {
  head,
  documentElement: head,
  createElement: (_tag: string) => new FakeElement(),
  getElementById: (id: string) => head.children.find((c) => c.id === id) ?? null,
};
(globalThis as unknown as { document: unknown }).document = doc;

ok('not active before applying', isTextSpacingActiveInPage(TEXT_SPACING_STYLE_ID) === false);

applyTextSpacingInPage(TEXT_SPACING_CSS, TEXT_SPACING_STYLE_ID);
ok('active after applying', isTextSpacingActiveInPage(TEXT_SPACING_STYLE_ID) === true);
ok('exactly one style element', head.children.filter((c) => c.id === TEXT_SPACING_STYLE_ID).length === 1);
ok(
  'injected CSS matches constant',
  head.children.find((c) => c.id === TEXT_SPACING_STYLE_ID)?.textContent === TEXT_SPACING_CSS,
);

// Idempotent: applying again must not create a second element.
applyTextSpacingInPage(TEXT_SPACING_CSS, TEXT_SPACING_STYLE_ID);
ok('still one element after re-apply', head.children.filter((c) => c.id === TEXT_SPACING_STYLE_ID).length === 1);

removeTextSpacingInPage(TEXT_SPACING_STYLE_ID);
ok('removed cleanly', isTextSpacingActiveInPage(TEXT_SPACING_STYLE_ID) === false);
ok('no leftover nodes', head.children.length === 0);

// Removing when absent is a no-op, not an error.
let threw = false;
try {
  removeTextSpacingInPage(TEXT_SPACING_STYLE_ID);
} catch {
  threw = true;
}
ok('remove when absent is safe', threw === false);

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
