// Exercises the real normalization pipeline against synthetic engine output.
// Run with: tsx test/pipeline.test.ts
import { normalizeRunnerResult, groupByRule, axeRunOnlyTags } from '../src/lib/normalize';
import { DOCS } from '../src/docs';

const raw = {
  counts: { passes: 40, violations: 4, incomplete: 2, inapplicable: 14 },
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet contrast',
      helpUrl: 'https://x',
      tags: ['cat.color', 'wcag2aa', 'wcag143'],
      nodes: [
        { target: ['.b'], html: '<a class="b">two</a>', failureSummary: 'Fix:\n  raise contrast', domOrder: 5 },
        { target: ['.a'], html: '<a class="a">one</a>', failureSummary: 'Fix:\n  raise contrast', domOrder: 2 },
      ],
    },
    {
      id: 'image-alt',
      impact: 'critical',
      help: 'Images must have alt text',
      helpUrl: 'https://y',
      tags: ['cat.text-alternatives', 'wcag2a', 'wcag111'],
      nodes: [{ target: ['img'], html: '<img>', failureSummary: 'Fix:\n  add alt', domOrder: 0 }],
    },
    {
      id: 'some-future-rule',
      impact: 'minor',
      help: 'Future rule',
      helpUrl: 'https://z',
      tags: ['wcag2aa', 'wcag131'],
      nodes: [
        { target: ['.z'], html: '<div class="z"></div>', failureSummary: 'The scanner says:\n  do the thing', domOrder: 9 },
      ],
    },
  ],
};

const issues = normalizeRunnerResult(raw as any, DOCS);
const groups = groupByRule(issues);

const checks: [string, boolean, unknown][] = [];
const eq = (name: string, got: unknown, want: unknown) =>
  checks.push([name, JSON.stringify(got) === JSON.stringify(want), got]);

eq('issue count', issues.length, 4);
eq('sorted: critical image-alt first', issues[0]!.ruleId, 'image-alt');
eq('image-alt is documented', issues[0]!.documented, true);
eq('image-alt desc is OUR docs', issues[0]!.description.startsWith('A screen reader can'), true);
eq(
  'future rule falls back to engine summary',
  issues.find((i) => i.ruleId === 'some-future-rule')!.description,
  'The scanner says: do the thing',
);
eq('future rule marked undocumented', issues.find((i) => i.ruleId === 'some-future-rule')!.documented, false);
eq('wcag parsed + formatted', issues[0]!.wcag, ['1.1.1']);

const cg = groups.find((g) => g.ruleId === 'color-contrast')!;
eq('contrast grouped to one row', cg.occurrences.length, 2);
eq('occurrences sorted by DOM order', cg.occurrences.map((o) => o.selector), ['.a', '.b']);
eq('group order: critical first', groups[0]!.ruleId, 'image-alt');
eq('stable ids unique', new Set(issues.map((i) => i.id)).size, 4);

const tags = axeRunOnlyTags({
  theme: 'auto',
  wcagVersion: '2.2',
  conformanceLevel: 'AA',
  thoroughness: 'deep',
  experimentalRules: false,
  highlightStyle: 'overlay',
});
eq('2.2 AA deep includes wcag22aa', tags.includes('wcag22aa'), true);
eq('deep includes best-practice', tags.includes('best-practice'), true);
eq('deep includes experimental', tags.includes('experimental'), true);
eq('AA does not force AAA', tags.includes('wcag2aaa'), false);

let pass = 0;
for (const [name, ok, got] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> got: ${JSON.stringify(got)}`}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
