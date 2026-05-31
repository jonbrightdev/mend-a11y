// Guards the v1 docs corpus: every rule documented, every entry well-formed.
// Run with: tsx test/docs.test.ts
import { DOCS } from '../src/docs';

const V1_RULES = [
  'image-alt',
  'label',
  'nested-interactive',
  'color-contrast',
  'region',
  'heading-order',
  'empty-heading',
  'link-name',
  'button-name',
  'landmark-one-main',
  'aria-required-attr',
  'aria-valid-attr-value',
  'duplicate-id',
  'html-has-lang',
  'document-title',
  'meta-viewport',
  'frame-title',
  'list',
  'listitem',
  'tabindex',
];

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

ok(`all ${V1_RULES.length} v1 rules are documented`, V1_RULES.every((r) => r in DOCS));

for (const rule of V1_RULES) {
  const e = DOCS[rule];
  if (!e) {
    ok(`${rule}: present`, false);
    continue;
  }
  ok(`${rule}: summary non-empty`, typeof e.summary === 'string' && e.summary.trim().length > 0);
  ok(`${rule}: explanation has 2+ paragraphs`, typeof e.explanation === 'string' && e.explanation.includes('\n\n'));
  ok(
    `${rule}: >=1 example with before+after`,
    Array.isArray(e.examples) &&
      e.examples.length >= 1 &&
      e.examples.every((x) => x.before.trim().length > 0 && x.after.trim().length > 0),
  );
  ok(
    `${rule}: has a w3.org reference`,
    Array.isArray(e.references) &&
      e.references.length >= 1 &&
      e.references.every((r) => /^https:\/\/www\.w3\.org\//.test(r.url) && r.label.length > 0),
  );
}

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
