// Guards the page-outline extractor: headings are collected in document order
// with correct levels and skipped-level flagging, landmarks are classified per
// the HTML-AAM defaults (header/footer only at the top level, section/form only
// when named), accessible names resolve from aria-labelledby then aria-label,
// and selectors prefer ids. Run with: tsx test/outline.test.ts
import { extractOutlineInPage } from '../src/lib/outline';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// --- Minimal DOM stub (no jsdom), enough to run the injected function. ---
class El {
  tagName: string;
  textContent = '';
  children: El[] = [];
  parent: El | null = null;
  nodeType = 1;
  private attrs: Record<string, string> = {};

  constructor(tag: string, attrs: Record<string, string> = {}, text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.textContent = text;
  }

  get id(): string {
    return this.attrs['id'] ?? '';
  }
  get parentElement(): El | null {
    return this.parent;
  }
  getAttribute(k: string): string | null {
    return k in this.attrs ? this.attrs[k]! : null;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  // Splits the selector on ',' and walks self + ancestors, matching on tag name.
  closest(sel: string): El | null {
    const tags = sel.split(',').map((s) => s.trim());
    let node: El | null = this;
    while (node) {
      if (tags.includes(node.tagName.toLowerCase())) return node;
      node = node.parent;
    }
    return null;
  }
}

// Fixture in document order, parented under <body> inside <html>.
const html = new El('html');
const body = new El('body');
const h1 = new El('h1', {}, 'Welcome');
const h2a = new El('h2', {}, 'Start');
const h4 = new El('h4', {}, 'Edge'); // jumps h2 -> h4, a skipped level
const h2b = new El('h2', {}, 'Pricing');
const nav = new El('nav', { 'aria-label': 'Primary' });
const mainC = new El('main', { id: 'content' });
const main2 = new El('main'); // a second main landmark
const sectionNamed = new El('section', { 'aria-labelledby': 'relh' });
const relh = new El('span', { id: 'relh' }, 'Related links');
const sectionNoName = new El('section'); // no accessible name -> not a landmark
const header = new El('header'); // top-level -> banner
const footerTop = new El('footer'); // top-level -> contentinfo
const footerNested = new El('footer'); // inside a section -> not a landmark

html.children = [body];
body.parent = html;
body.children = [h1, h2a, h4, h2b, nav, mainC, main2, sectionNamed, sectionNoName, header, footerTop];
for (const c of body.children) c.parent = body;
sectionNamed.children = [relh];
relh.parent = sectionNamed;
sectionNoName.children = [footerNested];
footerNested.parent = sectionNoName;

// querySelectorAll order is document (preorder) order; the nested footer falls
// between its parent section and the following top-level header.
const nodes: El[] = [
  h1,
  h2a,
  h4,
  h2b,
  nav,
  mainC,
  main2,
  sectionNamed,
  sectionNoName,
  footerNested,
  header,
  footerTop,
];
const byId: Record<string, El> = { relh, content: mainC };

(globalThis as unknown as { window: unknown }).window = { CSS: { escape: (s: string) => s } };
(globalThis as unknown as { document: unknown }).document = {
  documentElement: html,
  querySelectorAll: (_sel: string) => nodes,
  getElementById: (id: string) => byId[id] ?? null,
};

const out = extractOutlineInPage();

// --- Headings ---
ok('four headings collected', out.headings.length === 4);
ok('heading levels are [1,2,4,2]', out.headings.map((h) => h.level).join(',') === '1,2,4,2');
ok(
  'only the h4 (index 2) is a skipped level',
  out.headings.map((h) => h.skipped).join(',') === 'false,false,true,false',
);
ok('h1 count is 1', out.summary.h1Count === 1);
ok('hasSkips is true', out.summary.hasSkips === true);
ok('first heading text is "Welcome"', out.headings[0]?.text === 'Welcome');

// --- Landmarks ---
ok('six landmarks collected', out.landmarks.length === 6);
ok(
  'landmark roles in document order',
  out.landmarks.map((l) => l.role).join(',') === 'navigation,main,main,region,banner,contentinfo',
);
ok('mainCount is 2', out.summary.mainCount === 2);
ok('landmarkCount summary is 6', out.summary.landmarkCount === 6);
ok('nav accessible name is "Primary"', out.landmarks[0]?.name === 'Primary');
const region = out.landmarks.find((l) => l.role === 'region');
ok('region name resolved via aria-labelledby', region?.name === 'Related links');
ok('main#content selector is "#content"', out.landmarks[1]?.selector === '#content');
ok('header maps to banner', out.landmarks.find((l) => l.tag === 'header')?.role === 'banner');

// --- Exclusions ---
ok(
  'unnamed section is excluded',
  out.landmarks.filter((l) => l.tag === 'section').length === 1,
);
ok(
  'nested footer is excluded (one contentinfo)',
  out.landmarks.filter((l) => l.tag === 'footer').length === 1,
);

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
